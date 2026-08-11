import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'
import { enterCreatedRoom, openCurrentRoomSettings } from './helpers'
import { slideToConfirm } from './slide-to-confirm'

test.setTimeout(90_000)

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
        const window_ = window as Window & { __installRetentionPrompts?: number }
        window_.__installRetentionPrompts = 0
        const event = new Event('beforeinstallprompt') as Event & {
            prompt: () => Promise<void>
            userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
        }
        event.prompt = async () => {
            window_.__installRetentionPrompts = (window_.__installRetentionPrompts ?? 0) + 1
        }
        event.userChoice = Promise.resolve({ outcome: choice })
        window.dispatchEvent(event)
    }, outcome)
}

async function modelAndroidBrowser(page: Page): Promise<void> {
    await page.addInitScript(() => {
        Object.defineProperties(window.navigator, {
            userAgent: {
                configurable: true,
                value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/127.0 Mobile Safari/537.36',
            },
            platform: { configurable: true, value: 'Linux armv8l' },
        })
    })
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

test('empty-room and post-aha guidance own the slot, and skipping Share defers install', async ({ page }) => {
    await modelAndroidBrowser(page)
    await createTwoPersonRoom(page, `No early install ${Date.now()}`)

    // An empty room already has two explicit next steps. The browser is otherwise
    // eligible for portable menu guidance, but Install must not become a third ask.
    await expect(page.getByTestId('empty-share')).toBeVisible()
    await expect(page.getByTestId('open-add-expense')).toBeVisible()
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)

    await page.getByTestId('open-add-expense').click()
    await expect(page.getByTestId('expense-drawer')).toBeVisible()
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    await page.getByTestId('expense-amount').fill('20')
    await page.getByTestId('expense-description').fill('First dinner')
    await page.getByTestId('save-expense').click()
    const postAha = page.getByRole('dialog', { name: 'First split done' })
    await expect(postAha).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)

    await postAha.getByTestId('skip-post-aha-share').click()
    await expect(postAha).toHaveCount(0)
    const deferral = await page.evaluate(() => {
        const slug = window.location.pathname.split('/').filter(Boolean).at(-1)
        const raw = slug ? window.localStorage.getItem(`ps:pwa-room:${slug}`) : null
        const state = raw ? (JSON.parse(raw) as { deferUntil?: number }) : null
        return { now: Date.now(), deferUntil: state?.deferUntil ?? 0 }
    })
    expect(deferral.deferUntil - deferral.now).toBeGreaterThan(29 * 60 * 1_000)
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
})

test('completed Share yields to an inline install card that upgrades, suspends for a drawer, and resumes', async ({
    page,
}) => {
    await modelAndroidBrowser(page)
    await stubSuccessfulShare(page)
    await createTwoPersonRoom(page, `Earned install ${Date.now()}`)

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
    const prompt = page.getByTestId('install-prompt')
    await expect(prompt).toBeVisible({ timeout: 6_000 })
    await expect(prompt).toContainText('No store, no account')
    await expect(prompt).toHaveAttribute('role', 'region')
    await expect(prompt).not.toHaveClass(/\bfixed\b/)
    await expect(prompt.getByRole('button', { name: 'Show me how' })).toBeVisible()

    // This is an inline next step, not a bottom overlay competing with the room's
    // persistent actions. Bring it into view and prove it remains above the footer.
    await prompt.scrollIntoViewIfNeeded()
    const [promptBox, footerActionBox] = await Promise.all([
        prompt.boundingBox(),
        page.getByTestId('open-add-expense').boundingBox(),
    ])
    expect(promptBox).not.toBeNull()
    expect(footerActionBox).not.toBeNull()
    expect(promptBox!.y + promptBox!.height).toBeLessThanOrEqual(footerActionBox!.y)

    // A late browser event upgrades this same card instead of creating a second
    // impression or tearing away the fallback while somebody is considering it.
    await offerBrowserInstall(page, 'accepted')
    await expect(prompt.getByRole('button', { name: 'Add Split' })).toBeVisible()

    // Persistent utility controls do not permanently disqualify installation, but
    // the drawer they open temporarily owns the guidance slot.
    await page.getByTestId('share-room').click()
    const genericShare = page.getByRole('dialog', { name: 'Share room' })
    await expect(genericShare).toBeVisible()
    await expect(prompt).toHaveCount(0)
    await genericShare.getByTestId('close-share').click()
    await expect(genericShare).toHaveCount(0)
    await expect(prompt).toBeVisible({ timeout: 6_000 })
    await expect(prompt.getByRole('button', { name: 'Add Split' })).toBeVisible()

    await prompt.getByRole('button', { name: 'Add Split' }).click()
    expect(
        await page.evaluate(
            () => (window as Window & { __installRetentionPrompts?: number }).__installRetentionPrompts ?? 0
        )
    ).toBe(1)
    await expect(prompt).toHaveCount(0)
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
    await page.locator('[data-testid="expense-row"][data-description="Solo booking"]:not([disabled])').click()
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

test('deleting the only ledger row gives the empty-room activation actions priority again', async ({ page }) => {
    await stubSuccessfulShare(page)
    await createTwoPersonRoom(page, `Deleted debt install guard ${Date.now()}`)
    await offerBrowserInstall(page)

    await addExpense(page, 'Temporary dinner')
    const postAha = page.getByRole('dialog', { name: 'First split done' })
    await postAha.getByTestId('share-link').click()
    await postAha.getByTestId('finish-post-aha-share').click()

    // Open the row during the quiet window, then remove the only history. The
    // durable maturity latch remains true, but the empty-room actions own the slot.
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

test('a fresh browser entering a mature room gets the waiting/manual install path after Join', async ({
    page,
    newDevice,
}) => {
    const roomUrl = await createTwoPersonRoom(page, `Mature first visit ${Date.now()}`)
    await addExpense(page, 'Organizer dinner')
    await page.getByTestId('skip-post-aha-share').click()

    const bea = await newDevice()
    await modelAndroidBrowser(bea)
    await bea.goto(roomUrl)
    await expect(bea.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await bea.waitForTimeout(2_000)
    await expect(bea.getByTestId('install-prompt')).toHaveCount(0)

    await bea.locator('[data-testid="claim-member"][data-member="Bea"]').click()
    await expect(bea.getByTestId('join-gate')).toHaveCount(0, { timeout: 15_000 })
    await expect(bea.getByTestId('latecomer-banner')).toHaveCount(0)

    // No share, contribution, or return happened on this device. A mature quiet
    // room is enough, including while Chromium has not emitted its optional event.
    const prompt = bea.getByTestId('install-prompt')
    await expect(prompt).toBeVisible({ timeout: 6_000 })
    await expect(prompt.getByRole('button', { name: 'Show me how' })).toBeVisible()
    await prompt.getByRole('button', { name: 'Show me how' }).click()

    const instructions = bea.getByRole('dialog', { name: 'Add Split from your browser' })
    await expect(instructions).toBeVisible()
    await expect(instructions).toContainText('split.peanut.me')

    // Installing through the very browser menu these steps describe can report
    // success while the sheet is open. It should close and restore the room's
    // stable title landmark rather than leave focus on a removed action.
    await bea.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
    await expect(instructions).toHaveCount(0)
    await expect(prompt).toHaveCount(0)
    await expect(bea.getByTestId('open-room-switcher')).toBeFocused()
})

test('the all-settled arrival owns this visit, while a later visit gets next-trip installation', async ({
    page,
    newDevice,
}) => {
    const roomUrl = await createTwoPersonRoom(page, `Settled install handoff ${Date.now()}`)
    await addExpense(page, 'Organizer dinner')
    await page.getByTestId('skip-post-aha-share').click()

    const bea = await newDevice()
    await modelAndroidBrowser(bea)
    await bea.goto(roomUrl)
    await expect(bea.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await bea.locator('[data-testid="claim-member"][data-member="Bea"]').click()
    await expect(bea.getByTestId('join-gate')).toHaveCount(0, { timeout: 15_000 })

    // Open the competing flow immediately. This exactly offsets the first equal
    // split, so closing the expense drawer transitions into the terminal moment.
    await bea.getByTestId('open-add-expense').click()
    await bea.getByTestId('expense-amount').fill('20')
    await bea.getByTestId('expense-description').fill('Bea pays next time')
    await bea.getByTestId('save-expense').click()
    await expect(bea.getByTestId('expense-row')).toHaveCount(2, { timeout: 15_000 })
    await expect(bea.locator('main [data-testid="all-settled"]')).toBeVisible({ timeout: 15_000 })
    await bea.waitForTimeout(2_000)
    await expect(bea.getByTestId('install-prompt')).toHaveCount(0)
    expect(await bea.evaluate(() => window.localStorage.getItem('ps:pwa-auto-shown-at'))).toBeNull()

    // The durable zero balance is not itself a permanent competing CTA. On a
    // later mount there is no fresh celebration, so installation owns the slot.
    await bea.reload()
    await expect(bea.locator('main [data-testid="all-settled"]')).toBeVisible({ timeout: 15_000 })
    const prompt = bea.getByTestId('install-prompt')
    await expect(prompt).toBeVisible({ timeout: 6_000 })
    await expect(prompt).toContainText('Keep Split one tap away for this trip and the next.')
    await expect(prompt.getByRole('button', { name: 'Show me how' })).toBeVisible()
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
