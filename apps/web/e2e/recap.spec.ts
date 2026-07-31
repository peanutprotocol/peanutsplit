import { expect, test, type Page } from '@playwright/test'

/**
 * The trip recap, and the PNG it shares.
 *
 * The recap page used to draw every member with the same fallback peanut, because its query
 * selected only `{ id, name }` — while the OG card for the very same recap drew per-name coloured
 * letter discs. One artefact, two answers about what these people look like. Both now read the
 * members' real avatar keys, and the card draws the personas rather than letters, which also means
 * no member's face depends on a codepoint the two shipped OG fonts might not carry.
 */

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.23' } })

async function roomWithPeople(page: Page, request: import('@playwright/test').APIRequestContext) {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Recap artefacts')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('room-link')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()
    await expect(page.getByTestId('open-room-settings')).toBeVisible({ timeout: 15_000 })

    const slug = new URL(page.url()).pathname.split('/')[2]
    for (const name of ['Bea', 'Cass']) {
        await request.post(`/api/rooms/${slug}/members`, { data: { name } })
    }
    return slug
}

test('the recap page has exactly one heading, like every other route', async ({ page, request }) => {
    const slug = await roomWithPeople(page, request)
    await page.goto(`/r/${slug}/recap`)

    // Was zero: the room name and the total were both <p>.
    const headings = await page.evaluate(() => ({
        h1: document.querySelectorAll('h1').length,
        h2: document.querySelectorAll('h2').length,
    }))
    expect(headings.h1).toBe(1)
    expect(headings.h2).toBeGreaterThanOrEqual(1)
})

test('the recap share card renders as a PNG', async ({ page, request }) => {
    const slug = await roomWithPeople(page, request)

    const card = await request.get(`/r/${slug}/recap/opengraph-image`)
    expect(card.status()).toBe(200)
    expect(card.headers()['content-type']).toContain('image/png')
    // Satori fails soft on a bad element tree — a near-empty PNG is how a broken card looks.
    expect((await card.body()).length).toBeGreaterThan(5_000)
})

test('each member on the recap draws their own face, not one shared fallback', async ({ page, request }) => {
    const slug = await roomWithPeople(page, request)
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
