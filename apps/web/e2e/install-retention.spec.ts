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

async function modelStandaloneDisplay(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const real = window.matchMedia.bind(window)
        window.matchMedia = (query: string) =>
            query.includes('display-mode: standalone')
                ? ({
                      matches: true,
                      media: query,
                      addEventListener() {},
                      removeEventListener() {},
                  } as MediaQueryList)
                : real(query)
    })
}

/**
 * A healthy-but-busy room stream. Every poke refetches the room and rerenders RoomScreen while
 * the install card's 1.5s quiet timer is running. A callback recreated by the parent render must
 * not restart that timer forever.
 */
async function modelNoisyRoomEvents(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const window_ = window as Window & { __pwaSsePokes?: number }
        class NoisyEventSource {
            static readonly CONNECTING = 0
            static readonly OPEN = 1
            static readonly CLOSED = 2
            readonly CONNECTING = 0
            readonly OPEN = 1
            readonly CLOSED = 2
            readonly url: string
            readonly withCredentials = false
            readyState = NoisyEventSource.CONNECTING
            onopen: ((event: Event) => void) | null = null
            onmessage: ((event: MessageEvent) => void) | null = null
            onerror: ((event: Event) => void) | null = null
            private pulse: ReturnType<typeof setInterval> | null = null

            constructor(url: string | URL) {
                this.url = String(url)
                window.setTimeout(() => {
                    this.readyState = NoisyEventSource.OPEN
                    this.onopen?.(new Event('open'))
                    this.pulse = window.setInterval(() => {
                        window_.__pwaSsePokes = (window_.__pwaSsePokes ?? 0) + 1
                        this.onmessage?.(new MessageEvent('message', { data: '{}' }))
                    }, 175)
                }, 0)
            }

            close() {
                this.readyState = NoisyEventSource.CLOSED
                if (this.pulse !== null) window.clearInterval(this.pulse)
            }

            addEventListener() {}
            removeEventListener() {}
            dispatchEvent() {
                return true
            }
        }

        Object.defineProperty(window, 'EventSource', { configurable: true, value: NoisyEventSource })
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

test('the install card survives realtime rerenders, fits 320px, upgrades, suspends, and resumes', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 })
    await modelAndroidBrowser(page)
    await modelNoisyRoomEvents(page)
    await stubSuccessfulShare(page)
    let roomReads = 0
    page.on('request', (request) => {
        const url = new URL(request.url())
        if (request.method() === 'GET' && /^\/api\/rooms\/[^/]+$/.test(url.pathname)) roomReads += 1
    })
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
    const readsWhenQuietWindowStarted = roomReads
    const prompt = page.getByTestId('install-prompt')
    await expect(prompt).toBeVisible({ timeout: 6_000 })
    await expect(prompt).toContainText('No app store. No account.')
    await expect(prompt).toHaveAttribute('role', 'region')
    await expect(prompt).not.toHaveClass(/\bfixed\b/)
    await expect(prompt.getByRole('button', { name: 'Install Split' })).toBeVisible()
    await expect(prompt.getByRole('button', { name: 'Not now' })).toBeVisible()
    await expect(prompt.locator('button')).toHaveCount(2)
    await expect(prompt.getByRole('button', { name: /close/i })).toHaveCount(0)
    expect(
        await page.evaluate(() => (window as Window & { __pwaSsePokes?: number }).__pwaSsePokes ?? 0)
    ).toBeGreaterThan(1)
    expect(roomReads).toBeGreaterThan(readsWhenQuietWindowStarted)

    // This is an inline next step, not a bottom overlay competing with the room's
    // persistent actions. Bring it into view and prove it remains above the footer.
    await prompt.scrollIntoViewIfNeeded()
    const [promptBox, footerActionBox, installBox, dismissBox] = await Promise.all([
        prompt.boundingBox(),
        page.getByTestId('open-add-expense').boundingBox(),
        prompt.getByRole('button', { name: 'Install Split' }).boundingBox(),
        prompt.getByRole('button', { name: 'Not now' }).boundingBox(),
    ])
    expect(promptBox).not.toBeNull()
    expect(footerActionBox).not.toBeNull()
    expect(installBox).not.toBeNull()
    expect(dismissBox).not.toBeNull()
    expect(promptBox!.x).toBeGreaterThanOrEqual(0)
    expect(promptBox!.x + promptBox!.width).toBeLessThanOrEqual(320)
    expect(promptBox!.y + promptBox!.height).toBeLessThanOrEqual(footerActionBox!.y)
    expect(dismissBox!.y).toBeGreaterThan(installBox!.y)
    expect(Math.abs(dismissBox!.width - installBox!.width)).toBeLessThanOrEqual(1)

    // A late browser event upgrades this same card instead of creating a second
    // impression or tearing away the fallback while somebody is considering it.
    await offerBrowserInstall(page, 'accepted')
    await expect(prompt.getByRole('button', { name: 'Install Split' })).toBeVisible()

    // Persistent utility controls do not permanently disqualify installation, but
    // the drawer they open temporarily owns the guidance slot.
    await page.getByTestId('share-room').click()
    const genericShare = page.getByRole('dialog', { name: 'Share room' })
    await expect(genericShare).toBeVisible()
    await expect(prompt).toHaveCount(0)
    await genericShare.getByTestId('close-share').click()
    await expect(genericShare).toHaveCount(0)
    await expect(prompt).toBeVisible({ timeout: 6_000 })
    await expect(prompt.getByRole('button', { name: 'Install Split' })).toBeVisible()

    await prompt.getByRole('button', { name: 'Install Split' }).click()
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

    // No share, contribution, or return happened on this device. A mature quiet room is enough,
    // including while Chromium has not emitted its optional event. Manual installation must leave
    // the room document before showing browser instructions.
    const prompt = bea.getByTestId('install-prompt')
    await expect(prompt).toBeVisible({ timeout: 6_000 })
    await expect(prompt.getByRole('button', { name: 'Install Split' })).toBeVisible()
    await prompt.getByRole('button', { name: 'Install Split' }).click()

    await expect(bea).toHaveURL(/\/app\?install=1&source=auto$/)
    await expect(bea).toHaveTitle('Split')
    const installSurface = bea.getByTestId('install-app-surface')
    await expect(installSurface).toBeVisible()
    await expect(installSurface.getByTestId('browser-install-steps')).toBeVisible()
    expect(new URL(bea.url()).pathname).toBe('/app')
    expect(bea.url()).not.toContain('/r/')
    expect(await bea.evaluate(() => localStorage.getItem('ps:pwa-snoozed-until'))).toBeNull()

    // A browser-menu install can complete while the canonical steps are open. The install surface
    // should leave immediately; it must not mark reading help as a dismissal.
    await bea.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
    await expect(installSurface).toHaveCount(0)
    await expect(bea).not.toHaveURL(/install=1/)
})

test('a room-named standalone shortcut gets the one-time repair CTA after Join', async ({ page, newDevice }) => {
    const roomUrl = await createTwoPersonRoom(page, `Standalone repair ${Date.now()}`)
    await addExpense(page, 'Organizer dinner')
    await page.getByTestId('skip-post-aha-share').click()

    const bea = await newDevice()
    await modelAndroidBrowser(bea)
    await modelStandaloneDisplay(bea)
    await bea.goto(roomUrl)
    await expect(bea.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await bea.locator('[data-testid="claim-member"][data-member="Bea"]').click()
    await expect(bea.getByTestId('join-gate')).toHaveCount(0, { timeout: 15_000 })

    const prompt = bea.getByTestId('install-prompt')
    await expect(prompt).toBeVisible({ timeout: 6_000 })
    await expect(prompt).toContainText('Check your Split icon')
    await expect(prompt).toContainText('If your icon shows a room name, replace it with Split.')
    await expect(prompt.getByRole('button', { name: 'Check icon' })).toBeVisible()

    // A late native event must not change the meaning of a repair notice that is already on
    // screen. The next action remains an identifier-free repair check, not a normal install ask.
    await offerBrowserInstall(bea, 'accepted')
    await expect(prompt.getByRole('button', { name: 'Check icon' })).toBeVisible()
    await expect(prompt.getByRole('button', { name: 'Install Split' })).toHaveCount(0)
    await prompt.getByRole('button', { name: 'Check icon' }).click()

    await expect(bea).toHaveURL(/\/app\?install=1&repair=1&source=auto$/)
    await expect(bea).toHaveTitle('Split')
    await expect(bea.getByTestId('install-repair-copy-room')).toBeVisible()
    expect(bea.url()).not.toContain(new URL(roomUrl).pathname)
    expect(await bea.evaluate(() => localStorage.getItem('ps:pwa-dismiss-count'))).toBeNull()
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
    await expect(prompt).toContainText('Keep this trip—and the next one—one tap away.')
    await prompt.getByRole('button', { name: 'Not now' }).click()
    await expect(prompt).toHaveCount(0)
    const refusal = await bea.evaluate(() => ({
        count: localStorage.getItem('ps:pwa-dismiss-count'),
        at: Number(localStorage.getItem('ps:pwa-dismissed-at')),
        legacy: localStorage.getItem('ps:pwa-snoozed-until'),
    }))
    expect(refusal.count).toBe('1')
    expect(Date.now() - refusal.at).toBeLessThan(10_000)
    expect(refusal.legacy).toBeNull()
    await bea.reload()
    await bea.waitForTimeout(2_000)
    await expect(bea.getByTestId('install-prompt')).toHaveCount(0)
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
    await expect(prompt.getByRole('button', { name: 'Install Split' })).toBeVisible()

    await page.route('**/api/rooms/*/install-handoff', (route) =>
        route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL', message: 'temporary failure' } }),
        })
    )
    await prompt.getByRole('button', { name: 'Install Split' }).click()
    await expect(page.getByText('Couldn’t prepare this room. Try again in a moment.')).toBeVisible()
    await expect(page.getByTestId('install-app-surface')).toHaveCount(0)

    await page.unroute('**/api/rooms/*/install-handoff')
    await prompt.getByRole('button', { name: 'Install Split' }).click()
    await expect(page).toHaveURL(/\/app\?install=1&source=auto$/, { timeout: 10_000 })
    await expect(page).toHaveTitle('Split')
    const installSurface = page.getByTestId('install-app-surface')
    await expect(installSurface.getByRole('heading', { name: 'Add Split to Home Screen' })).toBeVisible()
    await expect(installSurface.locator('ol > li')).toHaveCount(5)
    await expect(installSurface).not.toContainText('within 24 hours')
    expect(page.url()).not.toContain('/r/')
    const cookies = await page.context().cookies()
    expect(cookies.find((cookie) => cookie.name === '__Host-ps-install-handoff')).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
    })

    await installSurface.getByRole('link', { name: 'Continue to Split' }).click()
    await expect(page).toHaveURL(/\/app\?manage=1$/)
    expect(
        await page.evaluate(() => ({
            legacy: localStorage.getItem('ps:pwa-snoozed-until'),
            count: localStorage.getItem('ps:pwa-dismiss-count'),
        }))
    ).toEqual({ legacy: null, count: null })
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

    await prompt.getByRole('button', { name: 'Install Split' }).click()
    await prepareStarted
    await page.getByTestId('open-room-switcher').click()
    await expect(page.getByRole('dialog', { name: 'Rooms' })).toBeVisible()
    const preparedResponse = page.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().includes('/install-handoff')
    )
    releasePrepare?.()
    expect((await preparedResponse).status()).toBe(201)
    await page.waitForTimeout(100)
    await expect(page.getByTestId('install-app-surface')).toHaveCount(0)
    await expect(page).toHaveURL(/\/r\//)
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
    await expect(page.getByTestId('install-app-surface')).toHaveCount(0)
    await expect(page).toHaveURL(/\/r\//)
})
