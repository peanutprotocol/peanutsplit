import { devices, type APIRequestContext, type BrowserContextOptions, type Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * The iPhone store offer (INTERACTION.md 10.1, the recipient guard). It needs a server built with
 * `NEXT_PUBLIC_IOS_APP_STORE_ID`, which only the head leg of `native.yml` provides; every other run
 * skips it, so the plain suites stay exactly as they were.
 */
const STORE_ID = process.env.NEXT_PUBLIC_IOS_APP_STORE_ID ?? ''
test.skip(!STORE_ID, 'Needs a build with NEXT_PUBLIC_IOS_APP_STORE_ID set')
test.setTimeout(90_000)

const STORE_URL = `https://apps.apple.com/app/id${STORE_ID}`
const STORE_TAPPED_AT_KEY = 'ps:pwa-store-tapped-at:v1'
/** Every store surface the web can render, automatic or manual. */
const STORE_SURFACES = ['install-app-store', 'install-row-store', 'room-updates-store']

/** `newContext` rejects a device's browser choice; the rest of the descriptor is the device. */
const contextFor = (name: 'iPhone 14' | 'Pixel 7'): BrowserContextOptions => {
    const { defaultBrowserType: _browser, ...device } = devices[name]
    return device
}

async function createRoom(request: APIRequestContext, name: string): Promise<string> {
    const response = await request.post('/api/rooms', { data: { name, currency: 'EUR', creatorName: 'Ana' } })
    expect(response.ok()).toBe(true)
    const { room } = (await response.json()) as { room: { slug: string } }
    return room.slug
}

/** The Smart App Banner tag as Safari reads it: from the raw response, before `</head>`. */
async function bannerContent(request: APIRequestContext, path: string): Promise<string | null> {
    const response = await request.get(path)
    expect(response.status(), path).toBeLessThan(400)
    const html = await response.text()
    const headEnd = html.indexOf('</head>')
    expect(headEnd).toBeGreaterThan(0)
    const match = /<meta name="apple-itunes-app" content="([^"]*)"/.exec(html)
    if (!match) return null
    expect(match.index).toBeLessThan(headEnd)
    return match[1]
}

/** Lets the automatic surfaces pass their quiet time, then checks that none offered the store. */
async function expectNoStoreOffer(page: Page): Promise<void> {
    await page.waitForTimeout(2_500)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    for (const testId of STORE_SURFACES) await expect(page.getByTestId(testId)).toHaveCount(0)
    await expect(page.locator('a[href^="https://apps.apple.com/"]')).toHaveCount(0)
}

test('room and recap pages carry the banner tag in the head; no other page does', async ({ request }) => {
    const slug = await createRoom(request, 'Banner room')
    const expected = `app-id=${STORE_ID}, app-argument=https://peanutsplit.com/r/${slug}`

    expect(await bannerContent(request, `/r/${slug}`)).toBe(expected)
    expect(await bannerContent(request, `/r/${slug}/recap`)).toBe(expected)
    for (const path of ['/', '/blog', '/app', '/new', '/import', `/r/${slug}/import`]) {
        expect(await bannerContent(request, path), path).toBeNull()
    }
})

test('a first-time recipient on an iPhone gets the room and the banner, never a store card', async ({
    request,
    newDevice,
}) => {
    const slug = await createRoom(request, 'Recipient room')
    const page = await newDevice(contextFor('iPhone 14'))

    await page.goto(`/r/${slug}`)
    await expect(page.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('head meta[name="apple-itunes-app"]')).toHaveAttribute(
        'content',
        `app-id=${STORE_ID}, app-argument=https://peanutsplit.com/r/${slug}`
    )
    await expectNoStoreOffer(page)
})

test('on an iPhone, /app offers the store; a tap quiets every automatic offer', async ({ request, newDevice }) => {
    const [first, second] = await Promise.all([createRoom(request, 'Room one'), createRoom(request, 'Room two')])
    const page = await newDevice(contextFor('iPhone 14'))
    // The store is another origin; answer it locally so the test never leaves the machine.
    await page
        .context()
        .route('https://apps.apple.com/**', (route) =>
            route.fulfill({ status: 200, contentType: 'text/html', body: '<title>App Store</title>' })
        )

    await page.goto('/app?install=1&source=app')
    const store = page.getByTestId('install-app-store')
    await expect(store).toBeVisible({ timeout: 15_000 })
    await expect(store).toHaveAttribute('href', STORE_URL)
    await expect(page.getByTestId('install-app-native')).toHaveCount(0)

    await store.click()
    await page.waitForURL(STORE_URL)

    for (const slug of [first, first, second]) {
        await page.goto(`/r/${slug}`)
        await expect(page.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
        const tappedAt = await page.evaluate((key) => window.localStorage.getItem(key), STORE_TAPPED_AT_KEY)
        expect(Number(tappedAt)).toBeGreaterThan(0)
        // A store tap is not a refusal.
        expect(await page.evaluate(() => window.localStorage.getItem('ps:pwa-dismiss-count'))).toBeNull()
        await expectNoStoreOffer(page)
    }
})

test('on Android, the web keeps the PWA install and offers no store anywhere', async ({ request, newDevice }) => {
    const slug = await createRoom(request, 'Android room')
    const page = await newDevice(contextFor('Pixel 7'))

    await page.goto('/app?install=1&source=app')
    await expect(page.getByTestId('install-app-surface')).toBeVisible({ timeout: 15_000 })
    // Today's PWA path: the browser install steps until Chrome offers its own prompt.
    await expect(page.getByTestId('install-app-surface')).toContainText('Install Split')
    await expectNoStoreOffer(page)

    await page.goto(`/r/${slug}`)
    await expect(page.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await expectNoStoreOffer(page)
})
