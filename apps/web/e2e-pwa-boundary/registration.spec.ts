import { expect, test } from '@playwright/test'

const port = Number(process.env.PWA_BOUNDARY_PORT ?? 8777)
const productOrigin = process.env.PWA_BOUNDARY_PRODUCT_ORIGIN ?? `http://localhost:${port}`
const contentOrigin = process.env.PWA_BOUNDARY_CONTENT_ORIGIN ?? `http://localhost:${port}`
const contentMarker = process.env.PWA_BOUNDARY_CONTENT_MARKER

declare global {
    interface Window {
        __pwaBoundary?: {
            installPrompts: number
            registrationCalls: Array<{ scriptURL: string; serwistReady: boolean }>
        }
        __pwaBoundarySentinel?: string
    }
}

async function instrumentRegistration(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
        window.__pwaBoundary = { installPrompts: 0, registrationCalls: [] }
        window.addEventListener('beforeinstallprompt', () => {
            window.__pwaBoundary!.installPrompts += 1
        })

        if (!('serviceWorker' in navigator)) return
        const prototype = Object.getPrototypeOf(navigator.serviceWorker) as ServiceWorkerContainer
        const original = prototype.register
        prototype.register = function (scriptURL, options) {
            window.__pwaBoundary!.registrationCalls.push({
                scriptURL: String(scriptURL),
                serwistReady: window.serwist !== undefined,
            })
            return original.call(this, scriptURL, options)
        }
    })
}

function reportBrowserFailures(page: import('@playwright/test').Page) {
    page.on('console', (message) => {
        if (message.type() === 'error') console.error(`browser console: ${message.text()}`)
    })
    page.on('pageerror', (error) => console.error(`browser pageerror: ${error.message}`))
    page.on('requestfailed', (request) => {
        const error = request.failure()?.errorText ?? ''
        // Next cancels speculative RSC prefetches during full-document route changes.
        if (error === 'net::ERR_ABORTED') return
        console.error(`browser request failed: ${request.method()} ${request.url()} ${error}`)
    })
}

test('a fresh public guide creates no worker, cache, browser storage, or install surface', async ({ browser }) => {
    expect(contentMarker, 'PWA_BOUNDARY_CONTENT_MARKER must be supplied by the trusted edge test').toBeTruthy()

    const context = await browser.newContext({
        extraHTTPHeaders: {
            'x-forwarded-host': 'peanut.me',
            'x-peanut-split-edge-marker': contentMarker!,
        },
    })
    const page = await context.newPage()
    reportBrowserFailures(page)
    await instrumentRegistration(page)

    const response = await page.goto(`${contentOrigin}/en/split/guides/split-a-group-trip-across-countries`, {
        waitUntil: 'networkidle',
    })
    expect(response?.status()).toBe(200)
    await expect(page.locator('h1')).toBeVisible()

    // Give delayed hydration/effects time to betray an accidental shared registrar.
    await page.waitForTimeout(500)
    const state = await page.evaluate(async () => ({
        registrations: (await navigator.serviceWorker.getRegistrations()).length,
        caches: await caches.keys(),
        localStorage: localStorage.length,
        sessionStorage: sessionStorage.length,
        indexedDatabases: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).length : 0,
        registrationCalls: window.__pwaBoundary!.registrationCalls,
        installPrompts: window.__pwaBoundary!.installPrompts,
        installPreflight: Object.hasOwn(window, '__splitInstallPrompt'),
        serwistReady: window.serwist !== undefined,
        scripts: performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((name) => name.endsWith('.js')),
    }))

    expect(state.serwistReady).toBe(true)
    expect(state.registrations).toBe(0)
    expect(state.registrationCalls).toEqual([])
    expect(state.caches).toEqual([])
    expect(state.localStorage).toBe(0)
    expect(state.sessionStorage).toBe(0)
    expect(state.indexedDatabases).toBe(0)
    expect(state.installPrompts).toBe(0)
    expect(state.installPreflight).toBe(false)
    expect(state.scripts.some((url) => decodeURIComponent(url).includes('/(product-shell)/layout-'))).toBe(false)
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0)

    await page.evaluate(() => {
        window.__pwaBoundarySentinel = 'still-here'
        window.dispatchEvent(new Event('online'))
    })
    await page.waitForTimeout(250)
    expect(await page.evaluate(() => window.__pwaBoundarySentinel)).toBe('still-here')
    await context.close()
})

test('canonical product routes register through Serwist and remain installable and offline', async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-host': 'peanutsplit.com' } })
    const page = await context.newPage()
    reportBrowserFailures(page)
    await instrumentRegistration(page)

    const appResponse = await page.goto(`${productOrigin}/app`, { waitUntil: 'networkidle' })
    expect(appResponse?.status()).toBe(200)
    expect(new URL(page.url()).origin).toBe(productOrigin)
    expect(await page.evaluate(() => window.isSecureContext)).toBe(true)

    await expect.poll(() => page.evaluate(() => window.__pwaBoundary!.registrationCalls.length)).toBe(1)
    const calls = await page.evaluate(() => window.__pwaBoundary!.registrationCalls)
    expect(calls).toEqual([{ scriptURL: `${productOrigin}/sw.js`, serwistReady: true }])

    await expect
        .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length))
        .toBe(1)
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0)

    const manifestLinks = page.locator('head link[rel="manifest"]')
    await expect(manifestLinks).toHaveCount(1)
    await expect(manifestLinks).toHaveAttribute('href', '/manifest.webmanifest')
    await expect(page.locator('head script#split-install-preflight')).toHaveCount(1)

    const cdp = await context.newCDPSession(page)
    const appManifest = (await cdp.send('Page.getAppManifest')) as {
        url: string
        data: string
        errors: Array<unknown>
    }
    expect(appManifest.url).toBe(`${productOrigin}/manifest.webmanifest`)
    expect(appManifest.errors).toEqual([])
    expect(JSON.parse(appManifest.data)).toMatchObject({ start_url: '/app', display: 'standalone' })

    for (const route of ['/r/not-a-real-room', '/r/not-a-real-room/recap']) {
        const response = await page.goto(`${productOrigin}${route}`, { waitUntil: 'networkidle' })
        expect(response?.status(), route).toBe(200)
        await expect(page.locator('head link[rel="manifest"]'), route).toHaveCount(1)
        expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), route).toBe(true)
    }

    await page.goto(`${productOrigin}/app`, { waitUntil: 'networkidle' })
    await context.setOffline(true)
    const offlineResponse = await page.reload({ waitUntil: 'domcontentloaded' })
    expect(offlineResponse?.status()).toBe(200)
    expect(offlineResponse?.fromServiceWorker()).toBe(true)
    await context.setOffline(false)
    await context.close()
})
