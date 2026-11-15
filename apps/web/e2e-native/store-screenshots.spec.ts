import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'
import sharp from 'sharp'
import { uniqueClientIp } from '../e2e/fixtures'
import { mockCamera, TINY_JPEG } from '../e2e-v2/helpers'
import { API_ORIGIN, APP_ORIGIN, expect, test } from './fixtures'

/**
 * The store screenshots, the Play feature graphic and the Play icon (PLAN 7.3,
 * apps/web/store/screenshots.md). Not part of the cross-origin suite: it runs only with
 * STORE_SCREENSHOTS=1 and writes images into apps/web/store/assets/, which a person reviews and
 * commits. How to run it is in apps/web/store/assets/README.md.
 *
 * The app is the real static export talking to the real API server, so every screen is what a
 * phone shows. Two things are not real: the receipt-scan POST answers with the fixture below (no
 * model call), and the camera is the e2e-v2 fake (no host camera). The API server must run with a
 * placeholder SPLIT_OPENROUTER_API_KEY so its capability probe says scanning is on; the POST never
 * reaches it.
 */

test.skip(!process.env.STORE_SCREENSHOTS, 'store screenshots run only with STORE_SCREENSHOTS=1')
test.describe.configure({ mode: 'serial' })

/** The origin the export must be baked with for this spec: `pnpm native:build` with
 *  NEXT_PUBLIC_BASE_URL unset (the release default), unlike the cross-origin suite. */
const PRODUCT_ORIGIN = 'https://peanutsplit.com'
const STORE = path.resolve(__dirname, '../store')
const ASSETS = path.join(STORE, 'assets')

/** CSS viewport x 3 = the store's pixel size (screenshots.md, "Sizes"). */
const SETS = [
    { id: 'iphone-6.9', width: 440, height: 956, userAgent: 'iphone' },
    { id: 'iphone-6.3', width: 402, height: 874, userAgent: 'iphone' },
    { id: 'android-phone', width: 360, height: 640, userAgent: 'android' },
] as const

const USER_AGENTS = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    android:
        'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 wv',
}

// ── The seeded rooms (generic first names only, no real people) ─────────────────────────────

const PEOPLE = ['Ana', 'Ben', 'Carla', 'Dev'] as const
type Person = (typeof PEOPLE)[number]

/** The trip room of screens 1-4: four people, five expenses, everyone with a balance. */
const TRIP = {
    name: 'Lisbon trip',
    expenses: [
        { description: 'Sunset boat tour', amountMinor: '14000', paidBy: 'Ana' },
        { description: 'Tram tickets', amountMinor: '2560', paidBy: 'Dev' },
        { description: 'Groceries', amountMinor: '3875', paidBy: 'Carla' },
        { description: 'Dinner in Alfama', amountMinor: '9640', paidBy: 'Ana' },
        { description: 'Apartment', amountMinor: '48000', paidBy: 'Ben' },
    ],
} satisfies { name: string; expenses: { description: string; amountMinor: string; paidBy: Person }[] }

/** The two other rooms on the home screen (screen 5). */
const OTHER_ROOMS = [
    { name: 'Flat 4B', people: ['Ana', 'Ben', 'Carla'], expense: { description: 'Internet', amountMinor: '4500' } },
    { name: 'Ski weekend', people: ['Ana', 'Dev'], expense: { description: 'Lift passes', amountMinor: '19800' } },
] as const

/** What the "model" reads off the receipt in screen 3. A dinner for the four of them. */
const RECEIPT = {
    items: [
        { label: 'Grilled sardines', amountMinor: '1450', quantity: 1 },
        { label: 'Octopus rice', amountMinor: '2200', quantity: 1 },
        { label: 'Green salad', amountMinor: '850', quantity: 1 },
        { label: 'Vinho verde', amountMinor: '1800', quantity: 1 },
        { label: 'Custard tarts', amountMinor: '600', quantity: 4 },
    ],
    receiptTotalMinor: '6900',
    currency: 'EUR',
    merchant: 'Tasca do Largo',
    date: null,
}

/** Who had what on that receipt, by item index. */
const ASSIGNMENTS: (readonly Person[] | 'everyone')[] = [
    ['Ana', 'Ben'],
    ['Carla', 'Dev'],
    ['Carla'],
    ['Ana', 'Ben', 'Dev'],
    'everyone',
]

interface Seeded {
    slug: string
    name: string
    memberId: string
    memberToken: string
}

async function seedRoom(
    api: APIRequestContext,
    name: string,
    people: readonly string[],
    expenses: readonly { description: string; amountMinor: string; paidBy: string }[]
): Promise<Seeded> {
    const created = await api.post('/api/rooms', { data: { name, currency: 'EUR', creatorName: people[0] } })
    expect(created.status()).toBe(201)
    const { room, memberId, memberToken } = (await created.json()) as {
        room: { slug: string }
        memberId: string
        memberToken: string
    }
    const ids: Record<string, string> = { [people[0]]: memberId }
    for (const person of people.slice(1)) {
        const added = await api.post(`/api/rooms/${room.slug}/members`, { data: { name: person, intent: 'add' } })
        expect(added.status()).toBe(201)
        ids[person] = ((await added.json()) as { memberId: string }).memberId
    }
    for (const expense of expenses) {
        const saved = await api.post(`/api/rooms/${room.slug}/expenses`, {
            headers: { 'x-member-token': memberToken },
            data: {
                description: expense.description,
                amountMinor: expense.amountMinor,
                currency: 'EUR',
                paidById: ids[expense.paidBy],
                splitMode: 'EQUAL',
                participantIds: people.map((person) => ids[person]),
            },
        })
        expect(saved.status(), await saved.text()).toBe(201)
    }
    return { slug: room.slug, name, memberId, memberToken }
}

// ── One phone per screen ─────────────────────────────────────────────────────────────────────

/**
 * A fresh phone for one screen: Ana's identity in every seeded room, the three rooms in her
 * recent list, reduced motion so no capture lands mid-animation, and nothing but the two local
 * servers reachable.
 */
async function openPhone(browser: Browser, set: (typeof SETS)[number], rooms: Seeded[]): Promise<Page> {
    const context: BrowserContext = await browser.newContext({
        viewport: { width: set.width, height: set.height },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: USER_AGENTS[set.userAgent],
        locale: 'en-US',
        timezoneId: 'Europe/Lisbon',
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
    })
    const appIp = uniqueClientIp()
    // The export is baked with the production origin, so the share screen shows the real room
    // link. Its API calls are answered by the local server instead; nothing reaches production.
    // The live stream is cut (the room falls back to its normal refetch), because a fetched
    // response must end before it can be handed to the page.
    await context.route(
        (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
        async (route) => {
            const url = new URL(route.request().url())
            if (url.origin !== PRODUCT_ORIGIN || !url.pathname.startsWith('/api/') || url.pathname.endsWith('/events'))
                return route.abort()
            const response = await route.fetch({
                url: `${API_ORIGIN}${url.pathname}${url.search}`,
                headers: { ...route.request().headers(), 'x-forwarded-for': appIp },
            })
            await route.fulfill({ response })
        }
    )
    await context.addInitScript(
        ({ origin, list }) => {
            if (location.origin !== origin || sessionStorage.getItem('store:seeded') === '1') return
            sessionStorage.setItem('store:seeded', '1')
            list.forEach((room, index) => {
                localStorage.setItem(
                    `ps:member:${room.slug}`,
                    JSON.stringify({ memberId: room.memberId, name: 'Ana', token: room.memberToken })
                )
            })
            localStorage.setItem(
                'ps:recent',
                JSON.stringify(
                    list.map((room, index) => ({
                        slug: room.slug,
                        name: room.name,
                        lastSeenAt: Date.now() - index * 3_600_000,
                    }))
                )
            )
        },
        {
            origin: APP_ORIGIN,
            list: rooms.map(({ slug, name, memberId, memberToken }) => ({ slug, name, memberId, memberToken })),
        }
    )
    return context.newPage()
}

async function openTripRoom(page: Page, slug: string): Promise<void> {
    await page.goto(`/room/?slug=${slug}`)
    await expect(page.getByTestId('join-gate')).toHaveCount(0)
    for (const person of PEOPLE) {
        await expect(page.locator(`[data-testid="balance-card"][data-member="${person}"]`)).toBeVisible({
            timeout: 20_000,
        })
    }
    await expect(page.locator('[data-testid="expense-row"]')).toHaveCount(TRIP.expenses.length)
    // A fresh device celebrates the four-person roster once. It is a share prompt, not the room.
    const celebration = page.getByTestId('achievement-dismiss')
    if (await celebration.isVisible({ timeout: 3_000 }).catch(() => false)) await celebration.click()
    await expect(page.getByTestId('achievement-moment')).toHaveCount(0)
}

/** Every capture must hold no settle sheet, no web install offer and no placeholder text. */
async function capture(page: Page, file: string): Promise<void> {
    // The settle sheet's own parts: its transfer list, amount field and method buttons.
    await expect(
        page.locator('[data-testid="transfer-row"], [data-testid="settle-amount"], [data-testid^="method-"]')
    ).toHaveCount(0)
    await expect(page.locator('[data-testid^="install-"]')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(/lorem|placeholder|TODO|undefined|NaN|localhost/i)
    await page.evaluate(() => document.fonts.ready)
    // Settle any layout shift from the last state change before the capture.
    await page.waitForTimeout(400)
    mkdirSync(path.dirname(file), { recursive: true })
    await page.screenshot({ path: file, type: 'jpeg', quality: 90, animations: 'disabled', caret: 'hide' })
}

test('store screenshots: five screens at three sizes', async ({ browser, playwright }) => {
    test.setTimeout(15 * 60_000)
    const api = await playwright.request.newContext({
        baseURL: API_ORIGIN,
        extraHTTPHeaders: { 'x-forwarded-for': uniqueClientIp() },
    })
    // Seeded oldest first, so the trip room is the most recent one on the home screen.
    const others = []
    for (const room of [...OTHER_ROOMS].reverse()) {
        others.unshift(await seedRoom(api, room.name, room.people, [{ ...room.expense, paidBy: room.people[1] }]))
    }
    const trip = await seedRoom(api, TRIP.name, PEOPLE, TRIP.expenses)
    await api.dispose()
    const rooms = [trip, ...others]

    for (const set of SETS) {
        const out = (name: string) => path.join(ASSETS, 'screenshots', set.id, name)

        // 1. The trip room with its balances and expenses.
        {
            const page = await openPhone(browser, set, rooms)
            await openTripRoom(page, trip.slug)
            await capture(page, out('1-room.jpg'))
            await page.context().close()
        }

        // 2. The add-expense drawer mid-entry, with the split options open.
        {
            const page = await openPhone(browser, set, rooms)
            await openTripRoom(page, trip.slug)
            await page.getByTestId('open-add-expense').click()
            await expect(page.getByTestId('expense-drawer')).toBeVisible()
            await page.getByTestId('expense-amount').fill('64.80')
            await page.getByTestId('expense-description').fill('Fado night')
            await page.getByTestId('expense-split-summary').click()
            await expect(page.getByTestId('split-editor')).toBeVisible()
            await page.locator(':focus').evaluate((element) => (element as HTMLElement).blur())
            // Opening the editor scrolls the drawer on a short screen; the amount stays in view.
            await page.getByTestId('expense-drawer').evaluate((element) => {
                for (const node of [element, ...element.querySelectorAll<HTMLElement>('*')]) node.scrollTop = 0
            })
            await capture(page, out('2-add-expense.jpg'))
            await page.context().close()
        }

        // 3. Receipt scan review, every item assigned. Only the scan POST is mocked.
        {
            const page = await openPhone(browser, set, rooms)
            await mockCamera(page, 'ready')
            await page.route('**/api/rooms/*/receipt-parse', (route) =>
                route.request().method() === 'POST' ? route.fulfill({ json: RECEIPT }) : route.fallback()
            )
            await openTripRoom(page, trip.slug)
            await page.getByTestId('open-add-expense').click()
            await page.getByTestId('scan-bill').click({ timeout: 20_000 })
            // The app asks once before the first photo goes to the AI (OVERRIDES 1).
            const allow = page.getByTestId('scan-consent-allow')
            await expect(allow.or(page.getByTestId('scan-camera'))).toBeVisible({ timeout: 15_000 })
            if (await allow.isVisible()) await allow.click()
            await expect(page.getByTestId('scan-camera')).toBeVisible({ timeout: 15_000 })
            await page
                .getByTestId('scan-upload-input')
                .setInputFiles({ name: 'receipt.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG })
            await expect(page.getByTestId('scan-item-label')).toHaveCount(RECEIPT.items.length, { timeout: 20_000 })
            await page.getByTestId('scan-continue').click()
            const rows = page.getByTestId('scan-assign-row')
            await expect(rows).toHaveCount(RECEIPT.items.length)
            for (const [index, who] of ASSIGNMENTS.entries()) {
                const row = rows.nth(index)
                if (who === 'everyone') {
                    await row.getByTestId('scan-everyone').click()
                    continue
                }
                for (const person of who) {
                    const chip = row.locator(`[data-testid="scan-assignee-chip"][data-member="${person}"]`)
                    if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click()
                }
            }
            await expect(page.getByTestId('scan-unassigned')).toHaveCount(0)
            // The third item at the top: the last items, the per-person totals and the button show.
            await rows.nth(2).evaluate((element) => element.scrollIntoView({ block: 'start' }))
            await capture(page, out('3-receipt-scan.jpg'))
            await page.context().close()
        }

        // 4. The share moment: the room link and its QR code.
        {
            const page = await openPhone(browser, set, rooms)
            await openTripRoom(page, trip.slug)
            await page.getByTestId('share-room').click()
            await expect(page.getByTestId('room-qr')).toBeVisible({ timeout: 15_000 })
            await expect(page.getByTestId('room-link')).toContainText(`peanutsplit.com/r/${trip.slug}`)
            await capture(page, out('4-share.jpg'))
            await page.context().close()
        }

        // 5. The app home with three recent rooms. `manage=1` keeps the list on screen instead
        // of opening the most recent room.
        {
            const page = await openPhone(browser, set, rooms)
            await page.goto('/app/?manage=1')
            await expect(page.getByTestId('app-home')).toBeVisible({ timeout: 15_000 })
            for (const room of rooms) await expect(page.getByText(room.name, { exact: true })).toBeVisible()
            await capture(page, out('5-home.jpg'))
            await page.context().close()
        }
    }
})

test('store graphics: Play feature graphic and Play icon', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    // A local file with relative links to the repo's own fonts and art; nothing else may load.
    await page.route(/^(?!file:)/, (route) => route.abort())
    await page.goto(pathToFileURL(path.join(STORE, 'feature-graphic.html')).href)
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => [...document.fonts].filter((font) => font.status !== 'loaded').length)).toBe(0)
    for (const image of await page.locator('img').all()) {
        expect(await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(
            true
        )
    }
    mkdirSync(ASSETS, { recursive: true })
    await page.screenshot({ path: path.join(ASSETS, 'feature-graphic.jpg'), type: 'jpeg', quality: 92 })
    await context.close()

    // The app icon artwork as Play wants it: 512 px, opaque, PNG.
    await sharp(path.resolve(__dirname, '../resources/icon.png'))
        .resize(512, 512, { kernel: 'lanczos3' })
        .flatten({ background: '#FF90E8' })
        .removeAlpha()
        .png({ compressionLevel: 9 })
        .toFile(path.join(ASSETS, 'play-icon.png'))
})
