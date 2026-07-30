import { expect, test, type Page } from '@playwright/test'

/**
 * What this deployment tells the operating system about itself, on a v1 build.
 *
 * The manifest assertions are the ones that matter: it is served uncredentialed, cached by the
 * browser for as long as it likes, and a room slug in it would be a credential published to the
 * OS. The last assertion in each block is the same one — no `/r/` anywhere.
 *
 * Room creation is metered per IP (20/hour), so this file takes its own TEST-NET address rather
 * than sharing either project's budget.
 */
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.20' } })

test('the manifest names the app Split, offers one shortcut, and carries no room', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')
    expect(response.status()).toBe(200)

    const manifest = (await response.json()) as {
        name: string
        short_name: string
        shortcuts?: { name: string; url: string }[]
        share_target?: unknown
    }

    expect(manifest.name).toBe('Split')
    expect(manifest.short_name).toBe('Split')
    expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual(['/new'])
    // The share sheet is v2's, and this build is v1. An entry here would put Split in every
    // Android photo share sheet and then decline the photo.
    expect(manifest.share_target).toBeUndefined()
    expect(JSON.stringify(manifest)).not.toContain('/r/')
})

test('iOS is offered "Split" as the home-screen name', async ({ page }) => {
    // The tag lives in the root layout, so every route under it carries the same value — these two
    // are the routes that need no room and therefore no creation budget.
    for (const path of ['/', '/new']) {
        await page.goto(path)
        await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Split')
    }
})

/**
 * Both projects run every file, and the install row's whole job is to answer differently per
 * device — an iPhone user agent makes `isIOSDevice` true, a desktop Chrome one does not. So the
 * two device-specific states name the project they are true on.
 */
const onlyOn = (project: 'mobile' | 'desktop') =>
    test.skip(test.info().project.name !== project, `${project} project only`)

/**
 * The deferred banner arms a 20s idle timer and then opens a card over whatever is on screen.
 * These specs wait on a room creation, so that timer fires inside them. The snooze is the banner's
 * alone — the store still captures the event, which is the point of this whole wave.
 */
const snoozeInstallBanner = (page: Page) =>
    page.addInitScript(() => {
        window.localStorage.setItem('ps:pwa-dismiss-count', '3')
        window.localStorage.setItem('ps:pwa-dismissed-at', String(Date.now()))
    })

/** A room, its settings sheet, and the device sheet the install row lives in. */
async function openDeviceSheet(page: Page, name: string) {
    await page.goto('/new')
    await page.getByTestId('room-name').fill(name)
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('go-to-room')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()
    await page.waitForURL(/\/r\//)

    await page.getByTestId('open-room-settings').click()
    await page.getByTestId('device-row').click()
    await expect(page.getByTestId('device-sheet')).toBeVisible()
}

/**
 * Dispatch a fake `beforeinstallprompt` from the page, after the row has painted.
 *
 * Deliberately not fired on `load`: the store captures from Providers' mount effect, which is not
 * reliably before `load` in a dev build, and a spec that races hydration fails for the wrong
 * reason. Chromium fires the real event after its own installability check, which is later still.
 */
const offerTheBrowserPrompt = (page: Page, outcome: 'accepted' | 'dismissed') =>
    page.evaluate((choice) => {
        const window_ = window as typeof window & { __installPrompts?: number }
        window_.__installPrompts = 0
        const event = new Event('beforeinstallprompt') as Event & {
            prompt?: () => Promise<void>
            userChoice?: Promise<{ outcome: string }>
        }
        event.prompt = () => {
            window_.__installPrompts = (window_.__installPrompts ?? 0) + 1
            return Promise.resolve()
        }
        event.userChoice = Promise.resolve({ outcome: choice })
        window.dispatchEvent(event)
    }, outcome)

test.describe('the install row', () => {
    test.beforeEach(async ({ page }) => {
        await snoozeInstallBanner(page)
    })

    test('says so plainly where the browser offers nothing', async ({ page }) => {
        onlyOn('desktop')
        test.setTimeout(60_000)
        await openDeviceSheet(page, 'Install unsupported')

        const row = page.getByTestId('install-row-unsupported')
        await expect(row).toBeVisible()
        // Not a button: there is nothing behind it, and a tap that does nothing is a dead end.
        expect(await row.evaluate((element) => element.tagName)).not.toBe('BUTTON')
    })

    test('opens the Safari steps on iOS', async ({ page }) => {
        onlyOn('mobile')
        test.setTimeout(60_000)
        await openDeviceSheet(page, 'Install ios')

        await page.getByTestId('install-row-ios').click()
        await expect(page.getByText('Tap the Share button in the Safari toolbar.')).toBeVisible()
    })

    test('replays the browser prompt, and reads as installed once it is accepted', async ({ page }) => {
        test.setTimeout(60_000)
        await openDeviceSheet(page, 'Install accept')

        await expect(page.locator('[data-testid^="install-row-"]')).toBeVisible()
        await offerTheBrowserPrompt(page, 'accepted')
        await page.getByTestId('install-row-prompt').click()

        expect(
            await page.evaluate(() => (window as typeof window & { __installPrompts?: number }).__installPrompts)
        ).toBe(1)
        // The tab that installed the app is still a tab, so `display-mode: standalone` has not
        // flipped in it. The row must not fall back to "this browser can't add apps".
        await expect(page.getByTestId('install-row-installed')).toBeVisible()
    })

    test('says the prompt was declined, not that the browser cannot install', async ({ page }) => {
        test.setTimeout(60_000)
        await openDeviceSheet(page, 'Install decline')

        await expect(page.locator('[data-testid^="install-row-"]')).toBeVisible()
        await offerTheBrowserPrompt(page, 'dismissed')
        await page.getByTestId('install-row-prompt').click()

        await expect(page.getByTestId('install-row-dismissed')).toBeVisible()
        await expect(page.getByTestId('install-row-prompt')).toHaveCount(0)
        await expect(page.getByTestId('install-row-unsupported')).toHaveCount(0)
    })

    test('never offers to install an app that is already installed', async ({ page }) => {
        test.setTimeout(60_000)
        // Playwright cannot emulate display-mode, so the media query is the thing stubbed.
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
        await openDeviceSheet(page, 'Install standalone')

        await expect(page.getByTestId('install-row-installed')).toBeVisible()
        // Precedence: even a live prompt does not outrank being installed.
        await offerTheBrowserPrompt(page, 'accepted')
        await expect(page.getByTestId('install-row-prompt')).toHaveCount(0)
        await expect(page.getByTestId('install-row-installed')).toBeVisible()
    })
})

/**
 * The app badge, from the only half a browser test can see.
 *
 * The worker sets it, and `pnpm dev` builds no service worker at all (next.config.js gates serwist
 * on NODE_ENV), so the set is on the real-device list. What is asserted here is the page's
 * contract: it clears, it clears again on every return to the app, and it never sets.
 */
test('the app returning to view clears the badge, and the page never sets one', async ({ page }) => {
    await page.addInitScript(() => {
        const window_ = window as typeof window & { __clearAppBadge?: number; __setAppBadge?: number }
        window_.__clearAppBadge = 0
        window_.__setAppBadge = 0
        Object.assign(navigator, {
            clearAppBadge: () => {
                window_.__clearAppBadge = (window_.__clearAppBadge ?? 0) + 1
                return Promise.resolve()
            },
            setAppBadge: () => {
                window_.__setAppBadge = (window_.__setAppBadge ?? 0) + 1
                return Promise.resolve()
            },
        })
    })

    await page.goto('/')
    const counts = () =>
        page.evaluate(() => {
            const window_ = window as typeof window & { __clearAppBadge?: number; __setAppBadge?: number }
            return { cleared: window_.__clearAppBadge ?? 0, set: window_.__setAppBadge ?? 0 }
        })

    // Mount alone is a clear: arriving at the app is the honest read.
    await expect.poll(async () => (await counts()).cleared).toBeGreaterThanOrEqual(1)
    const onMount = (await counts()).cleared

    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect.poll(async () => (await counts()).cleared).toBeGreaterThan(onMount)

    // Only the worker may raise a dot. A page that sets one is a page claiming the user was away
    // from the app they are looking at.
    expect((await counts()).set).toBe(0)
})
