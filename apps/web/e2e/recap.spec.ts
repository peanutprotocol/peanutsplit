import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { test } from './fixtures'
import { enterCreatedRoom } from './helpers'
import { recapImagePath } from '../src/lib/recap'

/**
 * The trip recap, and the PNG it shares.
 *
 * The recap page used to draw every member with the same fallback peanut, because its query
 * selected only `{ id, name }` — while the OG card for the very same recap drew per-name coloured
 * letter discs. One artefact, two answers about what these people look like. Both now read the
 * members' real avatar keys, and the card draws the personas rather than letters, which also means
 * no member's face depends on a codepoint the two shipped OG fonts might not carry.
 *
 * The card's URL is imported from `lib/recap` rather than typed out here, and that is the point
 * of the import. This file used to assert a hand-written `/r/<slug>/recap/opengraph-image`, which
 * Next stopped serving the moment the route moved under a route group and picked up a build-scoped
 * hash. The assertion went red and stayed red — e2e is not in the pre-push gate — while what it
 * measured drifted from what the app does: the same string could just as easily have kept passing
 * against a route no caller was using. Assert the URL the share button actually fetches, whatever
 * it happens to be, and the question of which one that is has exactly one answer.
 */

async function roomWithPeople(page: Page) {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Recap artefacts')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()

    for (const name of ['Bea', 'Cass']) {
        await page.getByTestId('checkpoint-name').fill(name)
        await page.getByTestId('checkpoint-add').click()
        await expect(page.locator(`[data-testid="checkpoint-member"][data-member="${name}"]`)).toBeVisible()
    }

    await enterCreatedRoom(page)

    const slug = new URL(page.url()).pathname.split('/')[2]
    return slug
}

/**
 * Take the room to zero through the API, not the UI.
 *
 * The WRAPPED deck only renders on a settled room, and the journey that settles one by hand is
 * already covered several times over in `journeys.spec.ts`. Here the ledger is a fixture, so it is
 * written the fast way: one expense split three ways, then both debtors square up for exactly what
 * they owe.
 */
async function settleUp(request: APIRequestContext, slug: string): Promise<void> {
    const before = await request.get(`/api/rooms/${slug}`)
    expect(before.ok()).toBe(true)
    const state = (await before.json()) as { room: { currency: string }; members: { id: string; name: string }[] }
    const idOf = (name: string) => state.members.find((member) => member.name === name)!.id

    // The room's OWN currency, deliberately. An expense in anything else is re-priced through FX,
    // the three shares stop being round, and whether this room reaches zero would depend on a rate
    // table instead of on arithmetic. A €300 expense in a $ room lands as $324 and leaves $16
    // outstanding — the deck then never renders and the failure reads like a broken card.
    const expense = await request.post(`/api/rooms/${slug}/expenses`, {
        data: {
            description: 'Cabin',
            amountMinor: '30000',
            currency: state.room.currency,
            paidById: idOf('Ana'),
            splitMode: 'EQUAL',
            date: '2026-02-01T10:00:00Z',
        },
    })
    expect(expense.ok()).toBe(true)

    // Settle what each debtor actually owes rather than a figure assumed up here: the deck renders
    // only on a room that reached EXACTLY zero, so a remainder of one minor unit would hide it.
    const after = await request.get(`/api/rooms/${slug}`)
    expect(after.ok()).toBe(true)
    const balances = ((await after.json()) as { balances: Record<string, string> }).balances
    for (const name of ['Bea', 'Cass']) {
        const owed = -BigInt(balances[idOf(name)] ?? '0')
        expect(owed).toBeGreaterThan(0n)
        const settlement = await request.post(`/api/rooms/${slug}/settlements`, {
            data: { fromId: idOf(name), toId: idOf('Ana'), amountMinor: owed.toString() },
        })
        expect(settlement.ok()).toBe(true)
    }
}

test('the recap page has exactly one heading, like every other route', async ({ page }) => {
    const slug = await roomWithPeople(page)
    await page.goto(`/r/${slug}/recap`)

    // Was zero: the room name and the total were both <p>.
    await expect(page.getByRole('heading', { level: 1, name: 'Recap artefacts' })).toBeVisible()
    await expect(page.locator('h1')).toHaveCount(1)
    expect(await page.locator('h2').count()).toBeGreaterThanOrEqual(1)
})

test('the recap share card renders as a PNG at the path the app fetches', async ({ page, request }) => {
    const slug = await roomWithPeople(page)

    const card = await request.get(recapImagePath(slug))
    expect(card.status()).toBe(200)
    expect(card.headers()['content-type']).toContain('image/png')
    // Satori fails soft on a bad element tree — a near-empty PNG is how a broken card looks.
    expect((await card.body()).length).toBeGreaterThan(5_000)
})

/**
 * The other half of the recap card, and the half that was never broken.
 *
 * A chat client is handed this URL out of the page's `<head>`; `recapMetadata()` sets no
 * `openGraph.images` so that Next injects its own, hash and cache-buster included. The URL is
 * therefore read off the page rather than constructed — spelling it here would be a guess at a
 * value that changes with every build, which is the whole reason app code cannot use it.
 */
test('the recap page still unfurls with an image that resolves', async ({ page, request }) => {
    const slug = await roomWithPeople(page)
    await page.goto(`/r/${slug}/recap`)

    const unfurl = await page.locator('meta[property="og:image"]').first().getAttribute('content')
    expect(unfurl).toBeTruthy()

    const card = await request.get(unfurl!)
    expect(card.status()).toBe(200)
    expect(card.headers()['content-type']).toContain('image/png')
    expect((await card.body()).length).toBeGreaterThan(5_000)
})

test('each member on the recap draws their own face, not one shared fallback', async ({ page }) => {
    const slug = await roomWithPeople(page)
    await page.goto(`/r/${slug}/recap`)
    await page.waitForTimeout(600)

    // Every member row gets a random persona at create, so three members drawing one identical
    // shape means the avatar never reached the page — which is exactly what the bug was.
    const distinctFaces = await page.evaluate(() => {
        const svgs = [...document.querySelectorAll('svg')].map((svg) => svg.innerHTML)
        return new Set(svgs).size
    })
    expect(distinctFaces).toBeGreaterThan(1)
})

/**
 * The two consumers of the card, in a browser, on the screen a member actually reaches.
 *
 * Both failed in production for one reason — the URL 404ed — and neither failure was loud: the
 * deck tile drew as a broken image, and the share button caught its own throw and apologised. A
 * status-code assertion on the route would not have caught the drift on its own, because the
 * route was fine; what broke was the path the app built to reach it. So this asserts the app's
 * behaviour: pixels in the tile, and a file handed to the OS.
 */
test('the deck draws the recap card, and "Share the story" is not a dead button', async ({ page, request }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: async (payload: ShareData) => {
                ;(window as Window & { __recapSharePayload?: ShareData }).__recapSharePayload = payload
            },
        })
    })

    const slug = await roomWithPeople(page)
    await settleUp(request, slug)
    await page.goto(`/r/${slug}/recap`)

    const tile = page.getByTestId('wrapped-deck').locator('img').first()
    await expect(tile).toBeVisible({ timeout: 30_000 })
    // The deck sits below the fold on a phone and its tiles are `loading="lazy"`, so an
    // un-scrolled tile has no src request to succeed or fail at — the assertion below would be
    // measuring the viewport, not the route.
    await tile.scrollIntoViewIfNeeded()
    // `naturalWidth` is 0 for an <img> whose src never loaded, and stays 0 for as long as the page
    // is open — a broken tile is silent in every other respect.
    await expect
        .poll(() => tile.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 30_000 })
        .toBeGreaterThan(0)

    await page.getByTestId('share-recap').click()
    await expect
        .poll(() => page.evaluate(() => (window as Window & { __recapSharePayload?: ShareData }).__recapSharePayload), {
            timeout: 30_000,
        })
        .toBeTruthy()

    const payload = await page.evaluate(
        () => (window as Window & { __recapSharePayload?: ShareData }).__recapSharePayload
    )
    expect(payload?.files).toHaveLength(1)
    // No URL and no text: what leaves the group is the picture, never the slug.
    expect(Object.keys(payload ?? {})).toEqual(['files'])
    // The exact sentence a member got instead of their recap, from the catch in `RecapShareButton`.
    await expect(page.getByText('We could not build the recap card. Try again.')).toHaveCount(0)
})
