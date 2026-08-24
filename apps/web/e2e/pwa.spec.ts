import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { test } from './fixtures'
import { openCurrentRoomSettings } from './helpers'

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
test('the manifest names the app Split, offers v1 creation shortcuts, and carries no room', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')
    expect(response.status()).toBe(200)

    const manifest = (await response.json()) as {
        id: string
        start_url: string
        scope: string
        name: string
        short_name: string
        shortcuts?: { name: string; url: string }[]
        share_target?: unknown
    }

    expect(manifest.name).toBe('Split')
    expect(manifest.short_name).toBe('Split')
    expect(manifest).toMatchObject({ id: '/', start_url: '/app', scope: '/' })
    expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual(['/new', '/import'])
    // The share sheet is v2's, and this build is v1. An entry here would put Split in every
    // Android photo share sheet and then decline the photo.
    expect(manifest.share_target).toBeUndefined()
    expect(JSON.stringify(manifest)).not.toContain('/r/')
})

const chromeUserAgent =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/127.0 Mobile Safari/537.36'

async function expectIdentityInInitialHead(request: APIRequestContext, path: string): Promise<void> {
    const response = await request.get(path, { headers: { 'user-agent': chromeUserAgent } })
    expect(response.status()).toBe(200)
    const html = await response.text()
    const headEnd = html.indexOf('</head>')
    expect(headEnd).toBeGreaterThan(0)

    const initialHead = html.slice(0, headEnd)
    expect(initialHead).toContain('<meta name="google" content="notranslate"')
    expect(initialHead).toContain('<link rel="manifest" href="/manifest.webmanifest"')
    expect(initialHead).toContain('<meta name="application-name" content="Split"')
    expect(initialHead).toContain('<meta name="apple-mobile-web-app-title" content="Split"')
    expect(html.match(/name="google" content="notranslate"/g) ?? []).toHaveLength(1)
    expect(html.match(/rel="manifest"/g) ?? []).toHaveLength(1)
}

test('direct room and recap responses expose the Split manifest in the initial head', async ({ page, request }) => {
    const roomName = `PWA head contract ${Date.now()}`
    const created = await request.post('/api/rooms', {
        data: { name: roomName, currency: 'EUR', creatorName: 'Ana' },
    })
    expect(created.status()).toBe(201)
    const { room } = (await created.json()) as { room: { slug: string } }
    const roomPath = `/r/${room.slug}`

    // These are raw browser-UA responses, not the browser's repaired DOM. Next streams async
    // room metadata for ordinary browsers, so this catches the exact regression where inherited
    // manifest tags landed after </head> and Chromium reported `no-manifest`.
    await expectIdentityInInitialHead(request, roomPath)
    await expectIdentityInInitialHead(request, `${roomPath}/recap`)

    await page.goto(roomPath)
    await expect(page).toHaveTitle(`${roomName} — Peanut Split`)
    await expect(page.locator('head > link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
    await expect(page.locator('head > meta[name="application-name"]')).toHaveAttribute('content', 'Split')
})

test('the compatibility alias redirects instead of advertising a second installable Split', async ({ request }) => {
    const headers = { 'x-forwarded-host': 'split.peanut.me', 'user-agent': chromeUserAgent }
    const [manifest, app] = await Promise.all([
        request.get('/manifest.webmanifest', { headers, maxRedirects: 0 }),
        request.get('/app', { headers, maxRedirects: 0 }),
    ])

    expect(manifest.status()).toBe(308)
    expect(manifest.headers().location).toBe('https://peanutsplit.com/manifest.webmanifest')
    expect(app.status()).toBe(308)
    expect(app.headers().location).toBe('https://peanutsplit.com/app')
})

test('iOS is offered "Split" as the home-screen name', async ({ page }) => {
    // The tag lives in the root layout, so every route under it carries the same value — these two
    // are the routes that need no room and therefore no creation budget.
    for (const path of ['/', '/app', '/new']) {
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
 * These settings-row specs are not install-funnel tests. Keep any already-earned automatic card
 * asleep while they wait on room creation; the shared store must still capture the browser event,
 * which is the point of this whole wave.
 */
const snoozeInstallBanner = (page: Page) =>
    page.addInitScript(() => {
        try {
            if (window.sessionStorage.getItem('__test-install-backoff-seeded') === '1') return
            window.localStorage.setItem('ps:pwa-dismiss-count', '3')
            window.localStorage.setItem('ps:pwa-dismissed-at', String(Date.now()))
            window.sessionStorage.setItem('__test-install-backoff-seeded', '1')
        } catch {
            // The init script also runs on origin-less documents; retry on the first app document.
        }
    })

const modelAndroidBrowser = (page: Page) =>
    page.addInitScript(() => {
        Object.defineProperties(window.navigator, {
            userAgent: {
                value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/127.0 Mobile Safari/537.36',
            },
            platform: { value: 'Linux armv8l' },
        })
    })

const modelStandaloneDisplay = (page: Page) =>
    page.addInitScript(() => {
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

/** A room, its settings sheet, and the device sheet the install row lives in. */
async function openDeviceSheet(page: Page, name: string, { reloadRoom = false } = {}) {
    await page.goto('/new')
    await page.getByTestId('room-name').fill(name)
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('go-to-room')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()
    await page.waitForURL(/\/r\//)
    if (reloadRoom) await page.reload()

    await openCurrentRoomSettings(page)
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
        window.sessionStorage.setItem('__test-install-prompts', '0')
        const event = new Event('beforeinstallprompt') as Event & {
            prompt?: () => Promise<void>
            userChoice?: Promise<{ outcome: string }>
        }
        event.prompt = () => {
            window_.__installPrompts = (window_.__installPrompts ?? 0) + 1
            window.sessionStorage.setItem('__test-install-prompts', String(window_.__installPrompts))
            return Promise.resolve()
        }
        event.userChoice = Promise.resolve({ outcome: choice })
        window.dispatchEvent(event)
    }, outcome)

test.describe('the install row', () => {
    test.beforeEach(async ({ page }) => {
        await snoozeInstallBanner(page)
    })

    test('takes Android manual install to the canonical page and upgrades to a native button', async ({ page }) => {
        onlyOn('mobile')
        test.setTimeout(60_000)
        await modelAndroidBrowser(page)
        await openDeviceSheet(page, 'Install Android Chrome')

        const browserRow = page.getByTestId('install-row-browser')
        await expect(browserRow).toContainText('Install Split')
        await expect(browserRow).toContainText('Show install steps')
        await browserRow.click()

        await expect(page).toHaveURL(/\/app\?install=1&source=settings$/)
        await expect(page).toHaveTitle('Split')
        const surface = page.getByTestId('install-app-surface')
        await expect(surface).toBeVisible()
        await expect(surface.getByRole('heading', { name: 'Install Split' })).toBeVisible()
        await expect(surface).toContainText('Use your browser menu. Choose “Install app”—not “Create shortcut”.')
        await expect(surface).toContainText('Inside another app? Choose “Open in browser” first.')
        await expect(surface.getByTestId('browser-install-steps').locator('li')).toHaveCount(4)
        await expect(surface).toContainText('Open your browser menu.')
        await expect(surface).toContainText('Tap “Install app”. It may be under “Add to Home screen”.')
        await expect(surface).toContainText('Make sure the name is “Split”.')
        await expect(surface).toContainText('Tap “Install”.')
        await expect(surface).toContainText('No install option? Open this page in Chrome.')
        await expect(surface).toContainText('Room missing after installing? Open the original room link once.')
        await expect(surface.getByTestId('install-copy-room')).toHaveText('Copy original room link')
        expect(await page.evaluate(() => localStorage.getItem('ps:pwa-snoozed-until'))).toBeNull()
        const appOrigin = new URL(page.url()).origin

        // Chromium can deliver its event after this document paints. The same surface becomes a
        // real one-tap action; the person does not have to leave help and reopen Device settings.
        await offerTheBrowserPrompt(page, 'accepted')
        const nativeInstall = surface.getByTestId('install-app-native')
        await expect(nativeInstall).toHaveText('Install Split')
        await nativeInstall.click()
        await expect.poll(() => page.evaluate(() => sessionStorage.getItem('__test-install-prompts'))).toBe('1')
        await expect(page).toHaveURL(`${appOrigin}/app`)
        await expect(page).toHaveTitle('Split')
    })

    test('keeps desktop fallback instructions short and platform-specific', async ({ page }) => {
        onlyOn('desktop')
        await page.goto('/app?install=1&source=settings')

        await expect(page).toHaveURL(/\/app\?install=1&source=settings$/)
        await expect(page).toHaveTitle('Split')
        const surface = page.getByTestId('install-app-surface')
        await expect(surface.getByRole('heading', { name: 'Install Split' })).toBeVisible()
        await expect(surface).toContainText('Use your browser’s install option—not “Create shortcut”.')
        await expect(surface).toContainText('Inside another app? Choose “Open in browser” first.')
        await expect(surface.getByTestId('browser-install-steps').locator('li')).toHaveCount(3)
        await expect(surface).toContainText('Open your browser’s menu.')
        await expect(surface).toContainText('Choose “Install app”. On Mac, choose “Add to Dock”.')
        await expect(surface).toContainText('Make sure the name is “Split”, then confirm.')
        await expect(surface).toContainText('No install option? Open this page in Chrome.')
        await expect(surface.getByTestId('install-copy-room')).toHaveCount(0)
    })

    test('takes iOS to short home-screen steps on the slug-free Split page', async ({ page }) => {
        onlyOn('mobile')
        test.setTimeout(60_000)
        await openDeviceSheet(page, 'Install ios')

        const iosRow = page.getByTestId('install-row-ios')
        await expect(iosRow).toContainText('Add Split to Home Screen')
        await expect(iosRow).toContainText('Show install steps')
        await expect(page.getByTestId('install-row-browser')).toHaveCount(0)

        await iosRow.click()
        await expect(page).toHaveURL(/\/app\?install=1&source=settings$/)
        await expect(page).toHaveTitle('Split')
        const surface = page.getByTestId('install-app-surface')
        await expect(surface.getByRole('heading', { name: 'Add Split to your Home Screen' })).toBeVisible()
        await expect(surface).toContainText('Use your browser’s Share menu.')
        await expect(surface.locator('ol > li')).toHaveCount(4)
        await expect(surface).toContainText('Tap Share.')
        await expect(surface).toContainText('Tap “Add to Home Screen”.')
        await expect(surface).toContainText('Turn on “Open as Web App”, if you see it.')
        await expect(surface).toContainText('Tap “Add”.')
        await expect(surface).toContainText('Then open Split from the new icon.')
        await expect(surface).toContainText('Room missing after installing? Open the original room link once.')
        await expect(surface.getByTestId('install-copy-room')).toHaveText('Copy original room link')
        await expect(surface).not.toContainText('within 24 hours')
        expect(new URL(page.url()).pathname).toBe('/app')
        expect(page.url()).not.toContain('/r/')
    })

    test('replays the browser prompt, and reads as installed once it is accepted', async ({ page }) => {
        // Same reason as its siblings above: the row only exists on a device that can install.
        onlyOn('mobile')
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

    test('records a native decline and keeps the canonical install-page fallback', async ({ page }) => {
        // Same reason as its siblings above: the row only exists on a device that can install.
        onlyOn('mobile')
        test.setTimeout(60_000)
        await modelAndroidBrowser(page)
        await openDeviceSheet(page, 'Install decline')

        await expect(page.locator('[data-testid^="install-row-"]')).toBeVisible()
        await offerTheBrowserPrompt(page, 'dismissed')
        await page.getByTestId('install-row-prompt').click()

        await expect(page.getByTestId('install-row-dismissed')).toContainText('Show install steps')
        await expect(page.getByTestId('install-row-dismissed')).toBeFocused()
        await expect(page.getByTestId('install-row-prompt')).toHaveCount(0)
        const dismissal = await page.evaluate(() => ({
            count: localStorage.getItem('ps:pwa-dismiss-count'),
            at: Number(localStorage.getItem('ps:pwa-dismissed-at')),
        }))
        expect(dismissal.count).toBe('4')
        expect(Date.now() - dismissal.at).toBeLessThan(10_000)
        await page.getByTestId('install-row-dismissed').click()
        await expect(page).toHaveURL(/\/app\?install=1&source=settings$/)
        await expect(page.getByTestId('browser-install-steps')).toBeVisible()
    })

    test('leaves manual help when the browser reports that installation completed', async ({ page }) => {
        onlyOn('mobile')
        test.setTimeout(60_000)
        await modelAndroidBrowser(page)
        await openDeviceSheet(page, 'Install through menu')

        await page.getByTestId('install-row-browser').click()
        await expect(page).toHaveURL(/\/app\?install=1&source=settings$/)
        await expect(page.getByTestId('install-app-surface')).toBeVisible()
        await expect(page.getByTestId('browser-install-steps')).toBeVisible()
        const appOrigin = new URL(page.url()).origin
        await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))

        await expect(page.getByTestId('install-app-surface')).toHaveCount(0)
        await expect(page).toHaveURL(`${appOrigin}/app`)
        await expect(page).toHaveTitle('Split')
    })

    test('keeps a healthy canonical standalone app installed when a synthetic prompt arrives', async ({ page }) => {
        test.setTimeout(60_000)
        await modelStandaloneDisplay(page)
        await page.addInitScript(() => {
            try {
                localStorage.setItem('ps:pwa-canonical-launch:v1', '1')
            } catch {
                // about:blank has no storage; the script runs again on the app origin.
            }
        })
        await openDeviceSheet(page, 'Install standalone')

        await expect(page.getByTestId('install-row-installed')).toBeVisible()
        // A browser should not normally emit this event for an installed app. If it does, canonical
        // standalone evidence still wins so the healthy app cannot offer a duplicate installation.
        await offerTheBrowserPrompt(page, 'accepted')
        await expect(page.getByTestId('install-row-prompt')).toHaveCount(0)
        expect(
            await page.evaluate(() => (window as typeof window & { __installPrompts?: number }).__installPrompts)
        ).toBe(0)
        await expect(page.getByTestId('install-row-installed')).toBeVisible()
    })

    test('gives a room-named standalone shortcut an honest, slug-free repair path', async ({ page }) => {
        onlyOn('mobile')
        test.setTimeout(60_000)
        await modelAndroidBrowser(page)
        await modelStandaloneDisplay(page)
        await openDeviceSheet(page, 'KUNC shortcut repair', { reloadRoom: true })

        const roomUrl = new URL(page.url())
        expect(roomUrl.pathname).toMatch(/^\/r\//)
        await expect(page.getByTestId('install-row-repair')).toContainText('Split icon')
        await expect(page.getByTestId('install-row-repair')).toContainText('Check')

        // A Next client transition is still running inside the old room shortcut. Visiting the
        // room chooser must not certify that container as a canonical manifest launch.
        await page.getByTestId('close-device-sheet').click()
        await expect(page.getByTestId('device-sheet')).toBeHidden()
        await page.getByTestId('close-room-settings').click()
        await expect(page.getByTestId('settings-sheet')).toBeHidden()
        await page.getByTestId('open-room-switcher').click()
        await page.getByTestId('room-switcher-manage').click()
        await expect(page).toHaveURL(/\/app\?manage=1$/)
        expect(await page.evaluate(() => localStorage.getItem('ps:pwa-canonical-launch:v1'))).toBeNull()

        await page.goto(`${roomUrl.origin}${roomUrl.pathname}`)
        await openCurrentRoomSettings(page)
        await page.getByTestId('device-row').click()
        const row = page.getByTestId('install-row-repair')
        await expect(row).toContainText('Split icon')
        await row.click()

        await expect(page).toHaveURL(/\/app\?install=1&repair=1&source=settings$/)
        await expect(page).toHaveTitle('Split')
        const surface = page.getByTestId('install-app-surface')
        await expect(surface.getByRole('heading', { name: 'Replace the old room icon' })).toBeVisible()
        await expect(surface).toContainText('Icon says Split? You’re all set. Icon shows a room name? Replace it.')
        await expect(surface).toContainText('Copy the room link before removing the old icon.')
        await expect(surface.getByTestId('install-repair-copy-room')).toHaveText('Copy room link')
        await expect(surface.locator('ol > li')).toHaveCount(3)
        await expect(surface).toContainText('Remove the icon named after the room.')
        await expect(surface).toContainText('Open the original room link in Chrome.')
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: roomUrl.origin })
        await surface.getByTestId('install-repair-copy-room').click()
        await expect(surface.getByRole('status')).toHaveText('Room link copied.')
        await expect(surface).toContainText('Open the copied room link in Chrome.')
        await expect(surface).toContainText('Tap ⋮, then “Install app”.')
        await expect(surface).toContainText('Install only if the name says “Split”.')
        expect(page.url()).not.toContain(roomUrl.pathname)
        expect(await page.evaluate(() => sessionStorage.getItem('ps:pwa-repair-room-url:v1'))).toBe(
            `${roomUrl.origin}${roomUrl.pathname}`
        )

        // Opening repair acknowledges only this migration notice. The existing install backoff
        // remains untouched, and returning to the room does not immediately repeat the card.
        await surface.getByTestId('install-repair-back').click()
        await expect(page).toHaveURL(`${roomUrl.origin}${roomUrl.pathname}`)
        await page.waitForTimeout(2_000)
        await expect(page.getByTestId('install-prompt')).toHaveCount(0)
        expect(
            await page.evaluate(() => ({
                repair: localStorage.getItem('ps:pwa-repair-notice-dismissed:v1'),
                dismissals: localStorage.getItem('ps:pwa-dismiss-count'),
            }))
        ).toEqual({ repair: '1', dismissals: '3' })
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

/**
 * The share target's landing screen, on a build whose scan flow is off.
 *
 * It ships unconditionally on purpose: an app installed while the flag was on keeps its manifest
 * until the browser refreshes it, so the POST can still arrive. Never a 404, never a 405, never a
 * dead end.
 */
test('the share landing says scanning is off and offers the way back', async ({ page }) => {
    const response = await page.goto('/share-target')

    expect(response?.status()).toBe(200)
    await expect(page.getByText('Scanning bills isn’t on yet.')).toBeVisible()
    await expect(page.getByTestId('share-target-open')).toHaveAttribute('href', '/app')
})
