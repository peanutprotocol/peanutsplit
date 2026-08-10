import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'
import { enterCreatedRoom, openCurrentRoomSettings } from './helpers'
import { slideToConfirm } from './slide-to-confirm'

test.setTimeout(90_000)

const OLD_IDLE_PROMPT_MS = 20_000

async function stubSuccessfulShare(page: Page): Promise<void> {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: async (payload: ShareData) => {
                ;(window as Window & { __installRetentionShare?: ShareData }).__installRetentionShare = payload
            },
        })
    })
}

async function offerBrowserInstall(page: Page, outcome: 'accepted' | 'dismissed' = 'dismissed'): Promise<void> {
    await page.evaluate((choice) => {
        const event = new Event('beforeinstallprompt') as Event & {
            prompt: () => Promise<void>
            userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
        }
        event.prompt = async () => {}
        event.userChoice = Promise.resolve({ outcome: choice })
        window.dispatchEvent(event)
    }, outcome)
}

async function modelIOSBrowser(page: Page): Promise<void> {
    await page.addInitScript(() => {
        Object.defineProperties(window.navigator, {
            userAgent: {
                configurable: true,
                value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Version/18.5 Mobile/15E148 Safari/604.1',
            },
            platform: { configurable: true, value: 'iPhone' },
            maxTouchPoints: { configurable: true, value: 5 },
        })
    })
}

async function createTwoPersonRoom(page: Page, name: string): Promise<string> {
    await page.goto('/new')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('room-name').fill(name)
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()

    const checkpoint = page.getByTestId('roster-checkpoint')
    await expect(checkpoint).toBeVisible({ timeout: 15_000 })
    await checkpoint.getByRole('textbox', { name: 'Name' }).fill('Bea')
    await checkpoint.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(checkpoint.locator('[data-testid="checkpoint-member"][data-member="Bea"]')).toBeVisible()
    return enterCreatedRoom(page)
}

async function addExpense(page: Page, description: string, amount = '20'): Promise<void> {
    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill(amount)
    await page.getByTestId('expense-description').fill(description)
    await page.getByTestId('save-expense').click()
}

test('an empty room stays quiet past the retired timer and skipping post-aha does not stack an install ask', async ({
    page,
}) => {
    await createTwoPersonRoom(page, `No early install ${Date.now()}`)
    await offerBrowserInstall(page)

    // Regression: the old policy interrupted every room after 20 seconds, even
    // when no shared balance or return reason existed.
    await page.waitForTimeout(OLD_IDLE_PROMPT_MS + 1_500)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)

    await addExpense(page, 'First dinner')
    const postAha = page.getByRole('dialog', { name: 'First split done' })
    await expect(postAha).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)

    await postAha.getByTestId('skip-post-aha-share').click()
    await expect(postAha).toHaveCount(0)
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
})

test('a completed post-aha share owns the moment, changes to Done, then earns the install card after close', async ({
    page,
}) => {
    await stubSuccessfulShare(page)
    await createTwoPersonRoom(page, `Earned install ${Date.now()}`)
    await offerBrowserInstall(page)

    await addExpense(page, 'Shared dinner', '60')
    const postAha = page.getByRole('dialog', { name: 'First split done' })
    await expect(postAha).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)

    await postAha.getByTestId('share-link').click()
    await expect(postAha.getByTestId('finish-post-aha-share')).toHaveText('Done')
    await expect
        .poll(() =>
            page.evaluate(() => (window as Window & { __installRetentionShare?: ShareData }).__installRetentionShare)
        )
        .toBeTruthy()

    await postAha.getByTestId('finish-post-aha-share').click()
    await expect(postAha).toHaveCount(0)
    await expect(page.getByTestId('install-prompt')).toBeVisible({ timeout: 6_000 })
    await expect(page.getByTestId('install-prompt')).toContainText('No store, no account')
    await expect(page.getByTestId('install-prompt')).toHaveAttribute('role', 'region')

    await page.getByTestId('install-prompt').getByRole('button', { name: 'Not now' }).click()
    await expect(page.getByTestId('open-room-switcher')).toBeFocused()
})

test('editing a solo expense into the first shared balance enters the same post-aha path', async ({ page }) => {
    await page.goto('/new')
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('room-name').fill(`Edited activation ${Date.now()}`)
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await enterCreatedRoom(page)

    await addExpense(page, 'Solo booking')
    await expect(page.getByRole('dialog', { name: 'First split done' })).toHaveCount(0)
    await page.locator('[data-testid="expense-row"][data-description="Solo booking"]').click()
    await page.getByTestId('expense-split-summary').click()
    await page.getByTestId('add-participant').click()
    await page.getByTestId('new-participant-name').fill('Bea')
    await page.getByTestId('add-participant-submit').click()
    await expect(page.locator('[data-testid="participant-toggle"][data-member="Bea"]')).toHaveAttribute(
        'aria-checked',
        'true'
    )
    await page.getByTestId('save-expense').click()

    await expect(page.getByRole('dialog', { name: 'First split done' })).toBeVisible({ timeout: 15_000 })
})

test('deleting the only active debt suppresses an already-earned install offer', async ({ page }) => {
    await stubSuccessfulShare(page)
    await createTwoPersonRoom(page, `Deleted debt install guard ${Date.now()}`)
    await offerBrowserInstall(page)

    await addExpense(page, 'Temporary dinner')
    const postAha = page.getByRole('dialog', { name: 'First split done' })
    await postAha.getByTestId('share-link').click()
    await postAha.getByTestId('finish-post-aha-share').click()

    // Open the row during the quiet window, then remove the only current debt.
    // The durable maturity latch remains true, but there is no return task for
    // an automatic retention ask to serve.
    await page.locator('[data-testid="expense-row"][data-description="Temporary dinner"]').click()
    await page.getByTestId('delete-expense').click()
    await slideToConfirm(page, page.getByTestId('confirm-delete-expense'))
    await expect(page.locator('[data-testid="expense-row"][data-description="Temporary dinner"]')).toHaveCount(0)
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
})

test('a hidden page neither records nor cools down an unseen earned offer', async ({ page }) => {
    await stubSuccessfulShare(page)
    await createTwoPersonRoom(page, `Hidden install guard ${Date.now()}`)
    await offerBrowserInstall(page)
    await addExpense(page, 'Shared dinner')
    const postAha = page.getByRole('dialog', { name: 'First split done' })
    await postAha.getByTestId('share-link').click()

    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
    })
    await postAha.getByTestId('finish-post-aha-share').click()
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('ps:pwa-auto-shown-at'))).toBeNull()

    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
        document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(page.getByTestId('install-prompt')).toBeVisible({ timeout: 6_000 })
})

test('sharing an empty room cannot replace a later post-aha refusal with installation', async ({ page }) => {
    await stubSuccessfulShare(page)
    await createTwoPersonRoom(page, `Share before balance ${Date.now()}`)
    await offerBrowserInstall(page)

    await page.getByTestId('empty-share').click()
    const generic = page.getByRole('dialog', { name: 'Share room' })
    await generic.getByTestId('share-link').click()
    await expect
        .poll(() =>
            page.evaluate(() => (window as Window & { __installRetentionShare?: ShareData }).__installRetentionShare)
        )
        .toBeTruthy()
    await generic.getByTestId('close-share').click()

    await addExpense(page, 'Balance after sharing')
    const postAha = page.getByRole('dialog', { name: 'First split done' })
    await expect(postAha).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    await postAha.getByTestId('skip-post-aha-share').click()
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
})

test('reloading an open post-aha share preserves its refusal semantics', async ({ page }) => {
    await stubSuccessfulShare(page)
    await createTwoPersonRoom(page, `Reload post-aha ${Date.now()}`)

    await page.getByTestId('empty-share').click()
    const generic = page.getByRole('dialog', { name: 'Share room' })
    await generic.getByTestId('share-link').click()
    await generic.getByTestId('close-share').click()

    await addExpense(page, 'Balance after earlier share')
    await expect(page.getByRole('dialog', { name: 'First split done' })).toBeVisible({ timeout: 15_000 })
    await page.reload()

    // `?share=1` survives navigation; the local pending marker restores why it
    // was open, so reload cannot turn Not now into a generic close and leak the
    // already-earned install ask immediately afterwards.
    const restoredPostAha = page.getByRole('dialog', { name: 'First split done' })
    await expect(restoredPostAha).toBeVisible({ timeout: 15_000 })
    await offerBrowserInstall(page)
    await restoredPostAha.getByTestId('skip-post-aha-share').click()
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
})

test('an opened-room device earns the ask on a later server-confirmed contribution, not its passive first view', async ({
    page,
    newDevice,
}) => {
    const roomUrl = await createTwoPersonRoom(page, `Contributor install ${Date.now()}`)
    await addExpense(page, 'Organizer dinner')
    await page.getByTestId('skip-post-aha-share').click()

    const bea = await newDevice()
    await bea.goto(roomUrl)
    await expect(bea.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await bea.locator('[data-testid="claim-member"][data-member="Bea"]').click()
    await expect(bea.getByTestId('join-gate')).toHaveCount(0, { timeout: 15_000 })
    await offerBrowserInstall(bea)

    await bea.waitForTimeout(2_000)
    await expect(bea.getByTestId('install-prompt')).toHaveCount(0)

    // Keep a non-zero balance: an exactly offsetting contribution settles the
    // room, and settled rooms intentionally remain settings-only.
    await addExpense(bea, 'Bea adds dessert', '10')
    await expect(bea.getByTestId('expense-row')).toHaveCount(2, { timeout: 15_000 })
    await expect(bea.getByTestId('install-prompt')).toBeVisible({ timeout: 6_000 })
})

test('a contribution that settles the room stays settings-only', async ({ page, newDevice }) => {
    const roomUrl = await createTwoPersonRoom(page, `Settled install guard ${Date.now()}`)
    await addExpense(page, 'Organizer dinner')
    await page.getByTestId('skip-post-aha-share').click()

    const bea = await newDevice()
    await bea.goto(roomUrl)
    await expect(bea.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await bea.locator('[data-testid="claim-member"][data-member="Bea"]').click()
    await expect(bea.getByTestId('join-gate')).toHaveCount(0, { timeout: 15_000 })
    await offerBrowserInstall(bea)

    // This exactly offsets the first equal split. The contribution is meaningful,
    // but there is no future room task for an automatic retention ask to serve.
    await addExpense(bea, 'Bea pays next time')
    await expect(bea.getByText('All settled up')).toBeVisible({ timeout: 15_000 })
    await bea.waitForTimeout(2_000)
    await expect(bea.getByTestId('install-prompt')).toHaveCount(0)
})

test('an opened-room device earns the ask on a deliberate mature return', async ({ page, newDevice }) => {
    const roomUrl = await createTwoPersonRoom(page, `Return install ${Date.now()}`)
    await addExpense(page, 'Organizer dinner')
    await page.getByTestId('skip-post-aha-share').click()

    const visitor = await newDevice()
    await visitor.goto(roomUrl)
    await expect(visitor.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await visitor.locator('[data-testid="claim-member"][data-member="Bea"]').click()
    await expect(visitor.getByTestId('join-gate')).toHaveCount(0, { timeout: 15_000 })
    // Keep the same document alive: installed PWAs are commonly backgrounded
    // and resumed without React ever remounting the room.
    await visitor.evaluate(() => {
        const clock = window as Window & { __installRetentionNow?: number }
        clock.__installRetentionNow = Date.now()
        Date.now = () => clock.__installRetentionNow as number
        window.dispatchEvent(new Event('blur'))
        clock.__installRetentionNow += 31 * 60 * 1000
        window.dispatchEvent(new Event('focus'))
    })
    await offerBrowserInstall(visitor)
    await expect(visitor.getByTestId('install-prompt')).toBeVisible({ timeout: 6_000 })
})

test('31 minutes continuously foregrounded followed by reload is not a mature return', async ({ page, newDevice }) => {
    const roomUrl = await createTwoPersonRoom(page, `Foreground reload ${Date.now()}`)
    await addExpense(page, 'Organizer dinner')
    await page.getByTestId('skip-post-aha-share').click()

    const visitor = await newDevice()
    await visitor.goto(roomUrl)
    await visitor.locator('[data-testid="claim-member"][data-member="Bea"]').click()
    await expect(visitor.getByTestId('join-gate')).toHaveCount(0, { timeout: 15_000 })
    await visitor.addInitScript(() => {
        const persisted = localStorage.getItem('__installRetentionClock')
        if (persisted !== null) Date.now = () => Number(persisted)
    })
    await visitor.evaluate(() => {
        const now = Date.now() + 31 * 60 * 1000
        localStorage.setItem('__installRetentionClock', String(now))
        Date.now = () => now
        // A normal reload emits pagehide at the end of the foreground session.
        window.dispatchEvent(new PageTransitionEvent('pagehide'))
    })
    await visitor.reload()
    await expect(visitor.getByTestId('open-room-switcher')).toBeVisible({ timeout: 15_000 })
    await offerBrowserInstall(visitor)
    await visitor.waitForTimeout(2_000)

    await expect(visitor.getByTestId('install-prompt')).toHaveCount(0)
})

test('the earned iOS offer withholds instructions on arm failure, then restores this exact room on retry', async ({
    page,
}) => {
    await modelIOSBrowser(page)
    await stubSuccessfulShare(page)
    await createTwoPersonRoom(page, `iOS earned install ${Date.now()}`)

    await addExpense(page, 'Shared dinner')
    const postAha = page.getByRole('dialog', { name: 'First split done' })
    await expect(postAha).toBeVisible({ timeout: 15_000 })
    await postAha.getByTestId('share-link').click()
    await postAha.getByTestId('finish-post-aha-share').click()

    const prompt = page.getByTestId('install-prompt')
    await expect(prompt).toBeVisible({ timeout: 6_000 })
    await expect(prompt.getByRole('button', { name: 'Show me how' })).toBeVisible()

    await page.route('**/api/rooms/*/install-handoff', (route) =>
        route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL', message: 'temporary failure' } }),
        })
    )
    await prompt.getByRole('button', { name: 'Show me how' }).click()
    await expect(page.getByText('Couldn’t prepare this room. Try again in a moment.')).toBeVisible()
    await expect(
        page.getByText('Open Split from the new icon within 24 hours. If this room isn’t there, open its link once.')
    ).toHaveCount(0)

    await page.unroute('**/api/rooms/*/install-handoff')
    await prompt.getByRole('button', { name: 'Show me how' }).click()
    await expect(
        page.getByText('Open Split from the new icon within 24 hours. If this room isn’t there, open its link once.')
    ).toBeVisible({ timeout: 10_000 })
    const cookies = await page.context().cookies()
    expect(cookies.find((cookie) => cookie.name === '__Host-ps-install-handoff')).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
    })

    await page.getByRole('button', { name: 'Got it' }).click()
    const snoozedUntil = await page.evaluate(() => Number(localStorage.getItem('ps:pwa-snoozed-until')))
    expect(snoozedUntil).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    await expect(page.getByTestId('open-room-switcher')).toBeFocused()
})

test('a delayed iOS arm cannot open instructions over a newer room drawer', async ({ page }) => {
    await modelIOSBrowser(page)
    await stubSuccessfulShare(page)
    await createTwoPersonRoom(page, `iOS blocker race ${Date.now()}`)
    await addExpense(page, 'Shared dinner')
    const postAha = page.getByRole('dialog', { name: 'First split done' })
    await postAha.getByTestId('share-link').click()
    await postAha.getByTestId('finish-post-aha-share').click()

    const prompt = page.getByTestId('install-prompt')
    await expect(prompt).toBeVisible({ timeout: 6_000 })
    let releasePrepare: (() => void) | undefined
    let sawPrepare: (() => void) | undefined
    const prepareStarted = new Promise<void>((resolve) => {
        sawPrepare = resolve
    })
    const prepareGate = new Promise<void>((resolve) => {
        releasePrepare = resolve
    })
    await page.route('**/api/rooms/*/install-handoff', async (route) => {
        sawPrepare?.()
        await prepareGate
        await route.continue()
    })

    await prompt.getByRole('button', { name: 'Show me how' }).click()
    await prepareStarted
    await page.getByTestId('open-room-switcher').click()
    await expect(page.getByRole('dialog', { name: 'Rooms' })).toBeVisible()
    const preparedResponse = page.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().includes('/install-handoff')
    )
    releasePrepare?.()
    expect((await preparedResponse).status()).toBe(201)
    await page.waitForTimeout(100)
    await expect(
        page.getByText('Open Split from the new icon within 24 hours. If this room isn’t there, open its link once.')
    ).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Rooms' })).toBeVisible()
    await expect
        .poll(async () => (await page.context().cookies()).some((cookie) => cookie.name.includes('install-handoff')))
        .toBe(false)
})

test('closing Device settings cancels a late iOS handoff instead of arming a hidden surface', async ({ page }) => {
    await modelIOSBrowser(page)
    await createTwoPersonRoom(page, `iOS settings cancellation ${Date.now()}`)
    await openCurrentRoomSettings(page)
    await page.getByTestId('device-row').click()
    const installRow = page.getByTestId('install-row-ios')
    await expect(installRow).toBeVisible()

    let releasePrepare: (() => void) | undefined
    let sawPrepare: (() => void) | undefined
    const prepareStarted = new Promise<void>((resolve) => {
        sawPrepare = resolve
    })
    const prepareGate = new Promise<void>((resolve) => {
        releasePrepare = resolve
    })
    await page.route('**/api/rooms/*/install-handoff', async (route) => {
        sawPrepare?.()
        await prepareGate
        await route.continue()
    })

    await installRow.click()
    await prepareStarted
    await page.getByTestId('close-device-sheet').click()
    const preparedResponse = page.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().includes('/install-handoff')
    )
    releasePrepare?.()
    expect((await preparedResponse).status()).toBe(201)

    await expect
        .poll(async () => (await page.context().cookies()).some((cookie) => cookie.name.includes('install-handoff')))
        .toBe(false)
    await expect(
        page.getByText('Open Split from the new icon within 24 hours. If this room isn’t there, open its link once.')
    ).toHaveCount(0)
})
