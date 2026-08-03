import { expect, test, type Page } from '@playwright/test'
import { EXPENSE_WRITE_TIMEOUT_MS } from '../src/lib/api'
import { enterCreatedRoom } from './helpers'

/**
 * Every test here works by intercepting the room's own requests, and `page.route` cannot see a
 * request a service worker made. Against a dev server that never mattered: `/sw.js` does not
 * exist there, so nothing takes control and the intercepts land. Against a production build the
 * worker registers, becomes the page's controller, and every fetch it forwards is invisible to
 * the intercept — the reads still happen, the test just never counts one and reads it as "the
 * refresh never fired". Blocking the worker keeps the interception authoritative in both builds.
 *
 * Nothing under test lives in the worker: the offline queue is app code over localStorage, and
 * these tests are about what the room does when its own reads and writes fail.
 */
test.use({ serviceWorkers: 'block' })

async function createRoom(page: Page, name: string): Promise<{ url: string; slug: string }> {
    await page.goto('/new')
    await page.getByTestId('room-name').fill(name)
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    const url = await enterCreatedRoom(page)
    const slug = new URL(url).pathname.split('/').at(-1)!
    await expect(page.getByTestId('open-add-expense')).toBeVisible({ timeout: 15_000 })
    return { url, slug }
}

async function fillExpense(page: Page, description: string): Promise<void> {
    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('24')
    await page.getByTestId('expense-description').fill(description)
}

test('two tabs converge on one replayed offline expense', async ({ page }) => {
    test.setTimeout(60_000)
    const context = page.context()
    let offline = false
    const delivered: string[] = []

    await context.route('**/api/rooms/*/expenses', async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        const body = route.request().postDataJSON() as { clientKey: string }
        if (offline) return route.abort('internetdisconnected')
        delivered.push(body.clientKey)
        return route.continue()
    })

    const { url, slug } = await createRoom(page, 'Two tab queue')
    const second = await context.newPage()
    await second.goto(url)
    await expect(second.getByTestId('join-gate')).toHaveCount(0)
    await expect(second.getByTestId('open-add-expense')).toBeVisible({ timeout: 15_000 })

    offline = true
    await fillExpense(page, 'Tunnel dinner')
    await page.getByTestId('save-expense').click()
    const firstRow = page.locator('[data-testid="expense-row"][data-description="Tunnel dinner"]')
    await expect(firstRow).toBeVisible()
    await expect
        .poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('ps:pending:'))))
        .toHaveLength(1)
    const queuedKey = await page.evaluate(() => Object.keys(localStorage).find((key) => key.startsWith('ps:pending:'))!)
    const clientKey = queuedKey.slice('ps:pending:'.length)
    // The row and storage record appear before `mutateAsync` resolves. Keep the connection down
    // until the drawer has closed and the save's automatic drain has finished.
    await expect(page).not.toHaveURL(/[?&]add=1(?:&|$)/)
    await expect
        .poll(
            async () => {
                const state = await page.evaluate(async () => navigator.locks.query())
                const named = (lock: { name: string }) => lock.name === 'peanut-split:pending-expenses'
                return !state.held.some(named) && !state.pending.some(named)
            },
            { timeout: 5_000 }
        )
        .toBe(true)

    // Both tabs hear the same online edge. Web Locks grants the replay to one; the other refreshes
    // storage after the owner removes the item.
    offline = false
    await Promise.all([
        page.evaluate(() => window.dispatchEvent(new Event('online'))),
        second.evaluate(() => window.dispatchEvent(new Event('online'))),
    ])

    await expect(firstRow).toBeEnabled({ timeout: 15_000 })
    const secondRow = second.locator('[data-testid="expense-row"][data-description="Tunnel dinner"]')
    await expect(firstRow).toHaveCount(1)
    await expect(secondRow).toHaveCount(1)
    await expect(secondRow).toBeEnabled({ timeout: 15_000 })
    await expect.poll(() => delivered.includes(clientKey)).toBe(true)
    expect(new Set(delivered)).toEqual(new Set([clientKey]))
    await expect
        .poll(() =>
            page.evaluate(
                async ({ roomSlug, expenseId }) => {
                    const state = (await fetch(`/api/rooms/${roomSlug}`).then((response) => response.json())) as {
                        expenses: Array<{ id: string; description: string }>
                    }
                    return state.expenses.filter(
                        (expense) => expense.id === expenseId && expense.description === 'Tunnel dinner'
                    ).length
                },
                { roomSlug: slug, expenseId: clientKey }
            )
        )
        .toBe(1)
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(`ps:pending:${key}`), clientKey)).toBeNull()

    await second.close()
})

test('two taps in one render produce one expense request', async ({ page }) => {
    let posts = 0
    await page.route('**/api/rooms/*/expenses', async (route) => {
        if (route.request().method() === 'POST') {
            posts += 1
            await new Promise((resolve) => setTimeout(resolve, 200))
        }
        await route.continue()
    })

    await createRoom(page, 'Double tap room')
    await fillExpense(page, 'One coffee')
    await page.getByTestId('save-expense').evaluate((button) => {
        ;(button as HTMLButtonElement).click()
        ;(button as HTMLButtonElement).click()
    })

    await expect(
        page.locator('[data-testid="expense-row"][data-description="One coffee"]:not([disabled])')
    ).toBeVisible({ timeout: 15_000 })
    expect(posts).toBe(1)
})

test('a hung first expense write queues and replays with its original client key', async ({ page }) => {
    test.setTimeout(45_000)
    let posts = 0
    let firstAttemptKey: string | undefined
    let replayKey: string | undefined
    let releaseReplay!: () => void
    const replayGate = new Promise<void>((resolve) => {
        releaseReplay = resolve
    })

    await page.route('**/api/rooms/*/expenses', async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        posts += 1
        const key = (route.request().postDataJSON() as { clientKey: string }).clientKey
        if (posts === 1) {
            firstAttemptKey = key
            await new Promise((resolve) => setTimeout(resolve, EXPENSE_WRITE_TIMEOUT_MS + 1_500))
            await route.abort('timedout').catch(() => undefined)
            return
        }
        replayKey = key
        await replayGate
        await route.continue()
    })

    await createRoom(page, 'Timeout queue room')
    await fillExpense(page, 'Slow tunnel dinner')
    await page.getByTestId('save-expense').click()

    await expect.poll(() => firstAttemptKey).toBeTruthy()
    await expect
        .poll(() => replayKey, {
            timeout: EXPENSE_WRITE_TIMEOUT_MS + 5_000,
        })
        .toBe(firstAttemptKey)
    await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(`ps:pending:${key}`), firstAttemptKey!))
        .not.toBeNull()

    releaseReplay()
    await expect(
        page.locator('[data-testid="expense-row"][data-description="Slow tunnel dinner"]:not([disabled])')
    ).toBeVisible({ timeout: 15_000 })
    await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(`ps:pending:${key}`), firstAttemptKey!))
        .toBeNull()
    await page.unrouteAll({ behavior: 'wait' })
})

test('a failed room refresh keeps cached history visible but blocks saved expense actions', async ({ page }) => {
    const { slug } = await createRoom(page, 'Stale balance room')
    await fillExpense(page, 'Saved dinner')
    await page.getByTestId('save-expense').click()
    const savedRow = page.locator('[data-testid="expense-row"][data-description="Saved dinner"]')
    // AnimatePresence can briefly keep the disabled optimistic row mounted while the saved row
    // enters. Wait for that ordinary exit to finish so this assertion still catches a durable
    // duplicate without making scheduler timing decide whether the test uses a strict locator.
    await expect(
        page.locator('[data-testid="expense-row"][data-description="Saved dinner"]:not([disabled])')
    ).toBeVisible({ timeout: 15_000 })
    await expect(savedRow).toHaveCount(1, { timeout: 15_000 })
    await expect(savedRow).toBeEnabled({ timeout: 15_000 })

    let failedReads = 0
    await page.route(`**/api/rooms/${slug}`, async (route) => {
        if (route.request().method() !== 'GET') return route.continue()
        failedReads += 1
        return route.abort('internetdisconnected')
    })

    // The room stream uses this same foreground edge to heal after a phone
    // wakes. Here it deterministically asks React Query to refresh cached data.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

    await expect.poll(() => failedReads).toBeGreaterThan(0)
    await expect(page.getByTestId('room-stale-warning')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('open-settle')).toBeDisabled()
    await expect(page.getByTestId('open-add-expense')).toBeEnabled()
    await expect(savedRow).toBeDisabled()
    await expect(savedRow).toHaveAttribute('aria-describedby', 'room-stale-warning-copy')
    await expect(page.getByTestId('delete-expense')).toHaveCount(0)

    // New expense creation remains deliberately available: its idempotent write
    // can queue, while stale server-owned history cannot be mutated.
    await page.getByTestId('open-add-expense').click()
    await expect(page.getByTestId('expense-amount')).toBeVisible()
})
