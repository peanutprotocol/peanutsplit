import { expect, test, type Page } from '@playwright/test'

async function createRoom(page: Page, name: string): Promise<{ url: string; slug: string }> {
    await page.goto('/new')
    await page.getByTestId('room-name').fill(name)
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()

    const roomLink = page.getByTestId('room-link')
    await expect(roomLink).toBeVisible({ timeout: 15_000 })
    const url = (await roomLink.innerText()).trim()
    const slug = new URL(url).pathname.split('/').at(-1)!
    await page.getByTestId('go-to-room').click()
    await expect(page.getByTestId('open-add-expense')).toBeVisible({ timeout: 15_000 })
    return { url, slug }
}

async function fillExpense(page: Page, description: string): Promise<void> {
    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('24')
    await page.getByTestId('expense-description').fill(description)
}

test('two tabs replay one offline expense through one queue owner', async ({ page }) => {
    test.setTimeout(60_000)
    const context = page.context()
    let offline = false
    const attempted: string[] = []
    const delivered: string[] = []

    await context.route('**/api/rooms/*/expenses', async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        const body = route.request().postDataJSON() as { clientKey: string }
        attempted.push(body.clientKey)
        if (offline) return route.abort('internetdisconnected')
        delivered.push(body.clientKey)
        return route.continue()
    })

    const { url } = await createRoom(page, 'Two tab queue')
    const second = await context.newPage()
    await second.goto(url)
    await expect(second.getByTestId('join-gate')).toHaveCount(0)
    await expect(second.getByTestId('open-add-expense')).toBeVisible({ timeout: 15_000 })

    offline = true
    await fillExpense(page, 'Tunnel dinner')
    await page.getByTestId('save-expense').click()
    await expect(page.locator('[data-testid="expense-row"][data-description="Tunnel dinner"]')).toBeVisible()
    await expect.poll(() => attempted.length).toBeGreaterThan(0)

    const clientKey = attempted[0]
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(`ps:pending:${key}`), clientKey)).not.toBeNull()

    // Both tabs hear the same online edge. Web Locks grants the replay to one;
    // the other refreshes storage after the owner removes the item.
    offline = false
    await Promise.all([
        page.evaluate(() => window.dispatchEvent(new Event('online'))),
        second.evaluate(() => window.dispatchEvent(new Event('online'))),
    ])

    await expect(
        page.locator('[data-testid="expense-row"][data-description="Tunnel dinner"]:not([disabled])')
    ).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => delivered.filter((key) => key === clientKey).length).toBe(1)
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

test('a failed room refresh keeps cached balances visible but blocks settling', async ({ page }) => {
    const { slug } = await createRoom(page, 'Stale balance room')
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
})
