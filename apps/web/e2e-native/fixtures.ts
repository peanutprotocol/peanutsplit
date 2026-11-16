import { test as base, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { deviceContext, uniqueClientIp } from '../e2e/fixtures'
import { draftRoomPeople, enterCreatedRoom } from '../e2e/helpers'

/**
 * Shared harness for the store-app suite (playwright.native.config.ts).
 *
 * `page` is the app: the static export on :8778, calling the API on :3100 cross-origin. A web
 * device (`openWeb`) is the web build on :3100 itself, the room link a friend opens in a browser.
 */

export const API_ORIGIN = 'http://localhost:3100'
export const APP_ORIGIN = 'http://localhost:8778'
const API_ROUTES = `${API_ORIGIN}/**`

/**
 * Why the app's address goes on through a route and not through `extraHTTPHeaders`: Chromium
 * treats an extra header as a page header, so every cross-origin call then preflights for
 * `x-forwarded-for`, which the server rightly does not allow, and the whole app reads as offline.
 * A route adds it below CORS. The cost: with a route active Playwright answers Chromium's
 * preflight itself, so the real preflight is exercised by the WebKit project (and by
 * cors.test.ts and proxy.test.ts). Chromium still enforces the response's
 * Access-Control-Allow-Origin, which is what the negative control in native.yml relies on.
 */
interface NativeFixtures {
    /** The address the app presents to the API, so its rate-limit buckets belong to this test. */
    appIp: string
    /** Opens a phone-sized browser on the web build (:3100): a second person's device. */
    openWeb: () => Promise<Page>
    /** Every script the app requested from an origin other than localhost. Must stay empty. */
    remoteScripts: string[]
}

export const test = base.extend<NativeFixtures>({
    appIp: async ({}, use) => {
        await use(uniqueClientIp())
    },

    context: async ({ context, appIp }, use) => {
        await context.route(API_ROUTES, (route) =>
            route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': appIp } })
        )
        await use(context)
    },

    // Seeding calls go straight to the API from their own address, never the app's budget.
    request: async ({ playwright }, use) => {
        const api = await playwright.request.newContext({
            baseURL: API_ORIGIN,
            extraHTTPHeaders: { 'x-forwarded-for': uniqueClientIp() },
        })
        await use(api)
        await api.dispose()
    },

    openWeb: async ({ browser }, use) => {
        const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = []
        await use(async () => {
            const context = await browser.newContext(deviceContext({ baseURL: API_ORIGIN, serviceWorkers: 'block' }))
            contexts.push(context)
            return context.newPage()
        })
        await Promise.all(contexts.map((context) => context.close()))
    },

    // The bundle must never run code fetched from the network (App Store 2.5.2). Checked for every
    // test, since any screen could pull a script in.
    remoteScripts: [
        async ({ context }, use) => {
            const remote: string[] = []
            context.on('request', (request) => {
                if (request.resourceType() !== 'script') return
                const url = new URL(request.url())
                if (url.protocol === 'data:') return
                // A blob: URL's origin is the page that made it, so it is judged by that.
                const { hostname } = new URL(url.origin)
                if (hostname !== 'localhost' && hostname !== '127.0.0.1') remote.push(request.url())
            })
            await use(remote)
            expect(remote, 'the app requested a script from another origin').toEqual([])
        },
        { auto: true },
    ],
})

export { expect }

// ── Offline ──────────────────────────────────────────────────────────────────────────────────

/**
 * "Offline" in this suite means the API is unreachable while the app's own files still load, as
 * on a phone where the bundle is local. `context.setOffline` would also cut :8778, so a hard load
 * or a lazy chunk would fail in a way no device ever sees.
 */
const OFFLINE_FLAG = 'e2e:offline'

/** Offline for the next hard load: the init script forces `navigator.onLine` false before the app boots. */
export async function goOfflineBeforeLoad(page: Page): Promise<void> {
    await page.route(API_ROUTES, (route) => route.abort('internetdisconnected'))
    await page.addInitScript((flag) => {
        if (sessionStorage.getItem(flag) !== '1') return
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    }, OFFLINE_FLAG)
    await page.evaluate((flag) => sessionStorage.setItem(flag, '1'), OFFLINE_FLAG)
}

/** Offline now, on a running page: the dispatched event is what pauses React Query's new reads. */
export async function goOffline(page: Page): Promise<void> {
    await page.route(API_ROUTES, (route) => route.abort('internetdisconnected'))
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
        window.dispatchEvent(new Event('offline'))
    })
}

/** Back online: the API answers again, `navigator.onLine` is true, and the page hears `online`. */
export async function goOnline(page: Page): Promise<void> {
    await page.unroute(API_ROUTES)
    await page.evaluate((flag) => {
        sessionStorage.removeItem(flag)
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
        window.dispatchEvent(new Event('online'))
    }, OFFLINE_FLAG)
}

// ── Rooms ────────────────────────────────────────────────────────────────────────────────────

export interface SeededRoom {
    slug: string
    name: string
}

/** A room made through the API, with `people` added as members, for specs whose subject is elsewhere. */
export async function seedRoom(
    request: APIRequestContext,
    name: string,
    creatorName = 'Ana',
    people: string[] = []
): Promise<SeededRoom> {
    const created = await request.post('/api/rooms', { data: { name, currency: 'EUR', creatorName } })
    expect(created.status()).toBe(201)
    const { room } = (await created.json()) as { room: { slug: string } }
    for (const person of people) {
        const joined = await request.post(`/api/rooms/${room.slug}/members`, { data: { name: person } })
        expect(joined.status()).toBe(201)
    }
    return { slug: room.slug, name }
}

/** Creates a room in the web build's own form and returns its slug. The creator is already in. */
export async function createRoomOnWeb(web: Page, name: string, creator: string, people: string[] = []) {
    await web.goto('/new')
    await web.getByTestId('room-name').fill(name)
    await web.getByTestId('room-currency').selectOption('EUR')
    await web.getByTestId('creator-name').fill(creator)
    if (people.length > 0) await draftRoomPeople(web, people)
    await web.getByTestId('create-room').click()
    const url = await enterCreatedRoom(web)
    return new URL(url).pathname.split('/').at(-1)!
}

/** Escapes a slug for use inside a URL regular expression. */
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The app's room screen URL for `slug`, with any drawer keys after it. */
export const appRoomUrl = (slug: string) => new RegExp(`/room/\\?slug=${escape(slug)}(?:&|$)`)

/**
 * A cold open of a shared room link in the app: a hard load of `/r/<slug>`, which the export
 * server answers with the root index.html, and the boot path takes to `/room/?slug=`.
 */
export async function openRoomLinkInApp(page: Page, slug: string): Promise<void> {
    await page.goto(`/r/${slug}`)
    await expect(page).toHaveURL(appRoomUrl(slug), { timeout: 15_000 })
}

/** Taps an existing name on the JoinGate. */
export async function claimMember(page: Page, name: string): Promise<void> {
    await page.locator(`[data-testid="claim-member"][data-member="${name}"]`).click()
    await expect(page.getByTestId('join-gate')).toHaveCount(0, { timeout: 15_000 })
}

/** One expense row by its description. */
export const expenseRow = (page: Page, description: string): Locator =>
    page.locator(`[data-testid="expense-row"][data-description="${description}"]`)

/** Adds an expense paid by the person holding the device, split equally. */
export async function addExpense(page: Page, description: string, amount = '24'): Promise<void> {
    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill(amount)
    await page.getByTestId('expense-description').fill(description)
    await page.getByTestId('save-expense').click()
    await expect(expenseRow(page, description)).toHaveCount(1, { timeout: 15_000 })
}

/** Writes the device's recent-room list the way the app stores it. */
export async function seedRecentRooms(page: Page, rooms: SeededRoom[]): Promise<void> {
    await page.evaluate(
        (list) =>
            localStorage.setItem(
                'ps:recent',
                JSON.stringify(list.map((room, index) => ({ ...room, lastSeenAt: Date.now() - index * 60_000 })))
            ),
        rooms
    )
}
