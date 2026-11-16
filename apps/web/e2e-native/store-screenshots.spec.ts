import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { APIRequestContext, Browser, BrowserContext, Locator, Page } from '@playwright/test'
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
 * Two steps. The first captures the real app at two raw phone sizes into store/captures/
 * (gitignored). The second puts each capture in store/screenshot-frame.html with a headline and
 * renders the three store sizes, then a contact sheet for review.
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
const CAPTURES = path.join(STORE, 'captures')

/** The raw phones the app is captured on, at DSF 3. One raw set feeds one or more store sets. */
const RAW_SETS = [
    { id: 'iphone', width: 402, height: 874, userAgent: 'iphone' },
    { id: 'android', width: 412, height: 892, userAgent: 'android' },
] as const
type RawSet = (typeof RAW_SETS)[number]

/**
 * The store sizes: CSS canvas x 3 = the store's pixel size (screenshots.md, "Sizes"), and where
 * the headline and the frame sit on that canvas (CSS px).
 */
const STORE_SETS = [
    {
        id: 'iphone-6.9',
        raw: 'iphone',
        layout: {
            width: 440,
            height: 956,
            margin: 26,
            headlineTop: 48,
            headlineSize: 50,
            gap: 13,
            sublineSize: 22,
            frameTop: 215,
            frameWidth: 370,
            frameBottom: 921,
            radius: 34,
        },
    },
    {
        id: 'iphone-6.3',
        raw: 'iphone',
        layout: {
            width: 402,
            height: 874,
            margin: 24,
            headlineTop: 44,
            headlineSize: 46,
            gap: 12,
            sublineSize: 20,
            frameTop: 196,
            frameWidth: 338,
            frameBottom: 842,
            radius: 34,
        },
    },
    {
        id: 'android-phone',
        raw: 'android',
        layout: {
            width: 360,
            height: 640,
            margin: 20,
            headlineTop: 28,
            headlineSize: 40,
            gap: 8,
            sublineSize: 17,
            frameTop: 150,
            frameWidth: 290,
            frameBottom: 620,
            radius: 28,
        },
    },
] as const satisfies readonly { id: string; raw: RawSet['id']; layout: Record<string, number> }[]
type StoreSet = (typeof STORE_SETS)[number]

/** The number of raw CSS rows the frame of a store set shows (the frame's border is 3 px). */
export function windowRows(storeSet: StoreSet): number {
    const { layout, raw } = storeSet
    const rawWidth = RAW_SETS.find((set) => set.id === raw)!.width
    return (layout.frameBottom - layout.frameTop - 6) / ((layout.frameWidth - 6) / rawWidth)
}

/**
 * One raw set can feed two store sets with slightly different windows. Something that must show
 * has to fit the smaller window; something that must stay hidden has to clear the larger one.
 */
function rowsFor(raw: RawSet): { visible: number; hidden: number } {
    const rows = STORE_SETS.filter((set) => set.raw === raw.id).map(windowRows)
    return { visible: Math.min(...rows), hidden: Math.max(...rows) }
}

const YELLOW = '#FFC900'
const PINK = '#FF90E8'

/**
 * The five screenshots in upload order (the first three show in search results). The file names
 * stay as check-assets.mjs expects. Headlines are landing page lines; `<mark>` is the highlight.
 * Every headline has two lines, so the frame sits at the same height on every screen.
 */
const SHOTS = [
    {
        file: '4-share',
        background: PINK,
        markColour: YELLOW,
        headlineHtml: 'ONE LINK.<br><mark>PICK YOUR NAME.</mark>',
        subline: 'No signup. No password.',
        anchor: 'bottom',
    },
    {
        file: '2-add-expense',
        background: YELLOW,
        markColour: PINK,
        headlineHtml: '<mark>EVERYONE</mark> ADDS<br>EXPENSES.',
        subline: 'Who paid, how much, for whom.',
        anchor: 'bottom',
    },
    {
        file: '1-room',
        background: '#EAFBEE',
        markColour: YELLOW,
        headlineHtml: 'WHO OWES WHAT.<br><mark>SORTED.</mark>',
        subline: 'Every balance in one room.',
        anchor: 'top',
    },
    {
        file: '3-receipt-scan',
        background: '#FAF4F0',
        markColour: YELLOW,
        headlineHtml: 'SCAN THE<br><mark>BILL.</mark>',
        subline: 'Then tap who had what.',
        anchor: 'bottom',
    },
    {
        file: '5-home',
        background: PINK,
        markColour: YELLOW,
        headlineHtml: 'SPLIT<br><mark>ANYTHING.</mark>',
        subline: 'Trips, roommates, dinners.',
        anchor: 'top',
    },
] as const

/**
 * Words no text on the canvas may hold: prices, promo words, store and OS names, and the
 * BANNED_EVERYWHERE list of store/check-listing.mjs (copied: that script runs on import).
 */
const BANNED_ON_CANVAS = [
    /\bfree\b/i,
    /\bbest\b/i,
    /#1\b/,
    /\bdownload/i,
    /\bno ads\b/i,
    /[$€£]\s?\d|\d\s?[$€£]|\d+[.,]\d{2}\b/,
    /\bapp ?store\b|\bgoogle\b|\bplay store\b|\biphone\b|\bipad\b|\bios\b|\bapple\b|\bandroid\b/i,
    /\bcrypto\w*/i,
    /\bwallets?\b/i,
    /\bstablecoins?\b/i,
    /\bUSDC\b/i,
    /\bdigital dollars?\b/i,
    /\bpayments?\b/i,
    /\bsend(?:s|ing)? money\b/i,
    /\btransfers?\b/i,
    /\bbank(?:s|ing)?\b/i,
    /\bPWA\b/i,
    /\bweb ?apps?\b/i,
    /\bworks? offline\b/i,
    /\bopens? offline\b/i,
    /(?<!@)\bPeanut\b(?! Split\b)/i,
    /\bsplitwise\b/i,
    /\btricount\b/i,
    /\bsettle ?up\b/i,
    /\bsplid\b/i,
    /\bkittysplit\b/i,
    /\bvenmo\b/i,
    /\bpaypal\b/i,
    /\brevolut\b/i,
    /\bbunq\b/i,
]

const USER_AGENTS = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    android:
        'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 wv',
}

// ── The seeded rooms (generic first names only, no real people) ─────────────────────────────

const PEOPLE = ['Ana', 'Ben', 'Carla', 'Dev'] as const
type Person = (typeof PEOPLE)[number]

/** The trip room of screens 1-4: four people, seven expenses (enough to fill the frame of screen 1),
 *  everyone with a balance. */
const TRIP = {
    name: 'Lisbon trip',
    expenses: [
        { description: 'Airport taxi', amountMinor: '3420', paidBy: 'Ben' },
        { description: 'Coffee and pastries', amountMinor: '1840', paidBy: 'Dev' },
        { description: 'Sunset boat tour', amountMinor: '14000', paidBy: 'Ana' },
        { description: 'Tram tickets', amountMinor: '2560', paidBy: 'Dev' },
        { description: 'Groceries', amountMinor: '3875', paidBy: 'Carla' },
        { description: 'Dinner in Alfama', amountMinor: '9640', paidBy: 'Ana' },
        { description: 'Guesthouse', amountMinor: '48000', paidBy: 'Ben' },
    ],
} satisfies { name: string; expenses: { description: string; amountMinor: string; paidBy: Person }[] }

/** The two other rooms on the home screen (screen 5): one per use case, each with its own doodle. */
const OTHER_ROOMS = [
    { name: 'Roommates', people: ['Ana', 'Ben', 'Carla'], expense: { description: 'Rent', amountMinor: '90000' } },
    { name: 'Tuesday ramen', people: ['Ana', 'Ben', 'Dev'], expense: { description: 'Ramen', amountMinor: '5400' } },
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
async function openPhone(browser: Browser, set: RawSet, rooms: Seeded[]): Promise<Page> {
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
    await page.screenshot({ path: file, type: 'png', animations: 'disabled', caret: 'hide' })
}

async function box(locator: Locator): Promise<{ top: number; bottom: number }> {
    const found = await locator.boundingBox({ timeout: 10_000 })
    expect(found, `${locator} has no box`).not.toBeNull()
    return { top: found!.y, bottom: found!.y + found!.height }
}

/** The element lies fully inside raw rows `from` to `to`, so the frame shows all of it. */
async function expectWithinRows(locator: Locator, from: number, to: number): Promise<void> {
    const { top, bottom } = await box(locator)
    expect(top, `${locator} top`).toBeGreaterThanOrEqual(from)
    expect(bottom, `${locator} bottom`).toBeLessThanOrEqual(to)
}

test('store screenshots: raw captures at two phone sizes', async ({ browser, playwright }) => {
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

    for (const raw of RAW_SETS) {
        const out = (name: string) => path.join(CAPTURES, raw.id, `${name}.png`)
        const { visible, hidden } = rowsFor(raw)
        const H = raw.height

        // 1. The trip room with its balances and expenses (frame anchored at the top).
        {
            const page = await openPhone(browser, raw, rooms)
            await openTripRoom(page, trip.slug)
            for (const card of await page.getByTestId('balance-card').all()) await expectWithinRows(card, 0, visible)
            let shownRows = 0
            for (const row of await page.getByTestId('expense-row').all()) {
                if ((await box(row)).bottom <= visible) shownRows += 1
            }
            expect(shownRows).toBeGreaterThanOrEqual(4)
            // "Settle up" is also a competitor's name: it stays below the frame's window.
            for (const settle of await page.getByText('Settle up', { exact: true }).all()) {
                if (await settle.isVisible()) expect((await box(settle)).top).toBeGreaterThanOrEqual(hidden)
            }
            await capture(page, out('1-room'))
            await page.context().close()
        }

        // 2. The add-expense drawer mid-entry, with the split editor open (anchored at the bottom).
        {
            const page = await openPhone(browser, raw, rooms)
            await openTripRoom(page, trip.slug)
            await page.getByTestId('open-add-expense').click()
            await expect(page.getByTestId('expense-drawer')).toBeVisible()
            await page.getByTestId('expense-amount').fill('64.80')
            await page.getByTestId('expense-description').fill('Museum tickets')
            await page.getByTestId('expense-split-summary').click()
            await expect(page.getByTestId('split-editor')).toBeVisible()
            await page.locator(':focus').evaluate((element) => (element as HTMLElement).blur())
            await page.waitForTimeout(300)
            // Scroll the drawer so the last person row sits 12 px above the footer with the
            // "Add €64.80 expense" button. The amount may scroll out; the button carries it.
            const layout = await page.getByTestId('expense-drawer').evaluate((drawer) => {
                const editor = drawer.querySelector<HTMLElement>('[data-testid="split-editor"]')!
                const people = editor.querySelectorAll<HTMLElement>('ul[aria-label="Who shares this?"] > li')
                const lastRow = people[people.length - 1]
                const button = [...drawer.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
                    /^Add .+ expense$/.test(candidate.textContent?.trim() ?? '')
                )!
                // The footer is the button's outermost ancestor that does not hold the form.
                let footer: HTMLElement = button
                while (footer.parentElement && !footer.parentElement.contains(editor)) footer = footer.parentElement
                let scroller: HTMLElement | null = editor.parentElement
                while (scroller && scroller !== drawer) {
                    const overflow = getComputedStyle(scroller).overflowY
                    if ((overflow === 'auto' || overflow === 'scroll') && scroller.scrollHeight > scroller.clientHeight)
                        break
                    scroller = scroller.parentElement
                }
                if (scroller)
                    scroller.scrollTop +=
                        lastRow.getBoundingClientRect().bottom - (footer.getBoundingClientRect().top - 12)
                const heading = editor.querySelector('h3')!
                return {
                    people: people.length,
                    headingTop: heading.getBoundingClientRect().top,
                    lastRowBottom: lastRow.getBoundingClientRect().bottom,
                    footerTop: footer.getBoundingClientRect().top,
                    buttonTop: button.getBoundingClientRect().top,
                    buttonBottom: button.getBoundingClientRect().bottom,
                }
            })
            expect(layout.people).toBe(PEOPLE.length)
            await expect(page.getByText('Who shares this?', { exact: true })).toBeVisible()
            expect(layout.headingTop).toBeGreaterThanOrEqual(H - visible)
            expect(layout.lastRowBottom).toBeLessThanOrEqual(layout.footerTop)
            expect(layout.buttonTop).toBeGreaterThanOrEqual(0)
            expect(layout.buttonBottom).toBeLessThanOrEqual(H)
            await capture(page, out('2-add-expense'))
            await page.context().close()
        }

        // 3. Receipt scan review, every item assigned. Only the scan POST is mocked.
        {
            const page = await openPhone(browser, raw, rooms)
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
            // Scrolled to the end, so the per-person totals and "Use this split" show whole. When the
            // top of the frame's window would cut an item card, scroll back until that card shows
            // whole, as far as "Use this split" stays on screen ("Back to the items" may leave it).
            const scanRows = rowsFor(raw)
            const windowTop = H - scanRows.hidden
            await page.getByTestId('scan-apply').evaluate(
                (button, { top, height }) => {
                    let scroller: HTMLElement | null = button.parentElement
                    while (scroller) {
                        const overflow = getComputedStyle(scroller).overflowY
                        if (
                            (overflow === 'auto' || overflow === 'scroll') &&
                            scroller.scrollHeight > scroller.clientHeight
                        )
                            break
                        scroller = scroller.parentElement
                    }
                    if (!scroller) return
                    scroller.scrollTop = scroller.scrollHeight
                    for (const card of document.querySelectorAll('[data-testid="scan-assign-row"]')) {
                        const { top: cardTop, bottom } = card.getBoundingClientRect()
                        if (cardTop >= top || bottom <= top) continue
                        const room = height - 2 - button.getBoundingClientRect().bottom
                        scroller.scrollTop -= Math.min(top + 8 - cardTop, room)
                    }
                },
                { top: windowTop, height: H }
            )
            await page.waitForTimeout(300)
            for (const card of await page.getByTestId('scan-assign-row').all()) {
                const { top, bottom } = await box(card)
                for (const edge of [H - scanRows.visible, windowTop])
                    expect(top < edge && bottom > edge, `an item card is cut at row ${edge}`).toBe(false)
            }
            // The per-person totals block sits just above the button's group.
            await expectWithinRows(
                page.getByTestId('scan-apply').locator('xpath=../preceding-sibling::div[1]'),
                H - scanRows.visible,
                H
            )
            await expectWithinRows(page.getByTestId('scan-apply'), H - scanRows.visible, H)
            await capture(page, out('3-receipt-scan'))
            await page.context().close()
        }

        // 4. The share moment: the room link and its QR code (anchored at the bottom).
        {
            const page = await openPhone(browser, raw, rooms)
            await openTripRoom(page, trip.slug)
            await page.getByTestId('share-room').click()
            await expect(page.getByTestId('room-qr')).toBeVisible({ timeout: 15_000 })
            await expect(page.getByTestId('room-link')).toContainText(`peanutsplit.com/r/${trip.slug}`)
            await page.waitForTimeout(300)
            await expectWithinRows(page.getByTestId('room-qr'), H - visible, H)
            await expectWithinRows(page.getByTestId('room-link'), H - visible, H)
            await expectWithinRows(page.getByRole('button', { name: 'Share room link', exact: true }), H - visible, H)
            await capture(page, out('4-share'))
            await page.context().close()
        }

        // 5. The app home with three recent rooms, trimmed below "New split". `manage=1` keeps
        // the list on screen instead of opening the most recent room.
        {
            const page = await openPhone(browser, raw, rooms)
            await page.goto('/app/?manage=1')
            await expect(page.getByTestId('app-home')).toBeVisible({ timeout: 15_000 })
            for (const room of rooms) await expect(page.getByText(room.name, { exact: true })).toBeVisible()
            const newSplit = await box(page.getByTestId('app-new-split'))
            // 24 px under "New split", but never into "Import from Splitwise" (12 px below it),
            // which names a competitor.
            const importTop = (await box(page.getByTestId('app-import'))).top
            const trimmedHeight = Math.min(Math.ceil(newSplit.bottom) + 24, Math.floor(importTop))
            await page.setViewportSize({ width: raw.width, height: trimmedHeight })
            await page.waitForTimeout(300)
            for (const room of rooms)
                await expectWithinRows(page.getByText(room.name, { exact: true }), 0, trimmedHeight)
            await expectWithinRows(page.getByText('Saved on this device.', { exact: true }), 0, trimmedHeight)
            await expectWithinRows(page.getByTestId('app-new-split'), 0, trimmedHeight)
            expect((await box(page.getByTestId('app-import'))).top).toBeGreaterThanOrEqual(trimmedHeight)
            await capture(page, out('5-home'))
            await page.context().close()
        }
    }
})

test('store screenshots: framed at three store sizes, and the contact sheet', async ({ browser }) => {
    test.setTimeout(5 * 60_000)
    for (const storeSet of STORE_SETS) {
        const raw = RAW_SETS.find((set) => set.id === storeSet.raw)!
        const { layout } = storeSet
        const context = await browser.newContext({
            viewport: { width: layout.width, height: layout.height },
            deviceScaleFactor: 3,
            // The project's iPhone profile would lay the page out at 980 px and autosize its text.
            isMobile: false,
        })
        const page = await context.newPage()
        // A local file with relative links to the captures and the font; nothing else may load.
        await page.route(/^(?!file:)/, (route) => route.abort())
        await page.goto(pathToFileURL(path.join(STORE, 'screenshot-frame.html')).href)
        for (const shot of SHOTS) {
            const measured = await page.evaluate(
                (cfg) => (window as unknown as { render: (cfg: unknown) => Promise<RenderResult> }).render(cfg),
                { ...shot, capture: `captures/${raw.id}/${shot.file}.png`, layout }
            )
            const where = `${storeSet.id}/${shot.file}`
            expect(
                await page.evaluate(() => [...document.fonts].filter((font) => font.status !== 'loaded').length),
                where
            ).toBe(0)
            expect(await page.evaluate(() => document.fonts.check("1000 48px 'Roboto Flex'")), where).toBe(true)
            expect(measured.image.complete, where).toBe(true)
            expect(measured.image.naturalWidth, where).toBe(raw.width * 3)
            expect(measured.headline.height, `${where} headline lines`).toBeLessThanOrEqual(
                2 * measured.headline.lineHeight + 1
            )
            expect(measured.subline.height, `${where} sub-line lines`).toBeLessThanOrEqual(
                measured.subline.lineHeight + 1
            )
            for (const text of [measured.headline, measured.subline]) {
                expect(text.left, `${where} left margin`).toBeGreaterThanOrEqual(layout.margin - 0.5)
                expect(text.right, `${where} right margin`).toBeLessThanOrEqual(layout.width - layout.margin + 0.5)
            }
            expect(measured.subline.bottom, `${where} text above the frame`).toBeLessThanOrEqual(measured.frame.top)
            for (const pattern of BANNED_ON_CANVAS) expect(measured.text, `${where} ${pattern}`).not.toMatch(pattern)
            const file = path.join(ASSETS, 'screenshots', storeSet.id, `${shot.file}.jpg`)
            mkdirSync(path.dirname(file), { recursive: true })
            await page.screenshot({ path: file, type: 'jpeg', quality: 90 })
        }
        await context.close()
    }

    // One row per store set in upload order, longest side under 1600 px, for Konrad's review.
    const rowHeight = 480
    const gap = 16
    const tiles = []
    let sheetWidth = 0
    for (const [row, storeSet] of STORE_SETS.entries()) {
        let left = gap
        for (const shot of SHOTS) {
            const input = await sharp(path.join(ASSETS, 'screenshots', storeSet.id, `${shot.file}.jpg`))
                .resize({ height: rowHeight })
                .toBuffer({ resolveWithObject: true })
            tiles.push({ input: input.data, left, top: gap + row * (rowHeight + gap) })
            left += input.info.width + gap
        }
        sheetWidth = Math.max(sheetWidth, left)
    }
    const sheetHeight = gap + STORE_SETS.length * (rowHeight + gap)
    expect(Math.max(sheetWidth, sheetHeight)).toBeLessThanOrEqual(1600)
    await sharp({ create: { width: sheetWidth, height: sheetHeight, channels: 3, background: '#ffffff' } })
        .composite(tiles)
        .jpeg({ quality: 85 })
        .toFile(path.join(CAPTURES, 'contact-sheet.jpg'))
})

interface TextBox {
    left: number
    right: number
    top: number
    bottom: number
    height: number
    lineHeight: number
}
interface RenderResult {
    headline: TextBox
    subline: TextBox
    frame: { top: number; bottom: number; left: number; right: number }
    image: { naturalWidth: number; complete: boolean }
    text: string
}

test('store graphics: Play feature graphic and Play icon', async ({ browser }) => {
    // Rendered at 2x and scaled down: at 1x the condensed 72 px headline merges letters.
    const context = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 2 })
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
    // Play crops the edges on some surfaces: no text within 32 px of any edge.
    const textBoxes = await page.locator('.copy').evaluate((copy) =>
        [...copy.querySelectorAll<HTMLElement>('.wordmark, h1, .lede, .chip')].map((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            const rect = element.classList.contains('chip')
                ? element.getBoundingClientRect()
                : range.getBoundingClientRect()
            return { name: element.className || element.tagName, ...rect.toJSON() }
        })
    )
    for (const text of textBoxes) {
        expect(text.left, text.name).toBeGreaterThanOrEqual(32)
        expect(text.top, text.name).toBeGreaterThanOrEqual(32)
        expect(text.right, text.name).toBeLessThanOrEqual(1024 - 32)
        expect(text.bottom, text.name).toBeLessThanOrEqual(500 - 32)
    }
    mkdirSync(ASSETS, { recursive: true })
    await sharp(await page.screenshot({ type: 'png' }))
        .resize(1024, 500, { kernel: 'lanczos3' })
        .jpeg({ quality: 92 })
        .toFile(path.join(ASSETS, 'feature-graphic.jpg'))
    await context.close()

    // The app icon artwork as Play wants it: 512 px, a 32-bit PNG that is fully opaque.
    await sharp(path.resolve(__dirname, '../resources/icon.png'))
        .resize(512, 512, { kernel: 'lanczos3' })
        .flatten({ background: '#FF90E8' })
        .ensureAlpha()
        .png({ compressionLevel: 9 })
        .toFile(path.join(ASSETS, 'play-icon.png'))
})
