/**
 * The recap image, rasterized for real, through both of the routes that serve it.
 *
 * This is the one test that proves the Satori rules in `recapCardArt.tsx` are
 * actually obeyed — a missing `display: flex` or a `gap` is a runtime throw, not
 * a type error, and the share button fetches these exact bytes. Consuming the
 * body is the point: `new ImageResponse()` renders lazily, so a test that only
 * checks the status code proves nothing.
 *
 * Two call shapes, because there are two routes and they are reached differently.
 * `recap/opengraph-image.tsx` is the metadata convention and is invoked as a
 * default export with `params`; `recap/card/route.ts` is a Route Handler and gets
 * a real `Request`, which is the only way the miss budget sees a caller at all.
 * `achievementRoute.test.ts` makes the same distinction for the six card kinds.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { encodeRoomDrawing } from '@/lib/room-drawing'
import { getTranslator } from '@/i18n/t'
import { recapImagePath } from '@/lib/recap'
import { prisma, truncateAll } from '@/server/test/db'
import { loadRecap, toRecapCard } from '@/server/og/recapCard'
import {
    enforceRateLimit,
    enforceRateLimitPreflight,
    LOOKUP_MISS_LIMIT,
    LOOKUP_MISS_SCOPE,
    resetRateLimits,
} from '@/server/rateLimit'
import RecapOgImage from '@/app/(product-shell)/r/[slug]/recap/opengraph-image'
import { GET as recapCard } from '@/app/(product-shell)/r/[slug]/recap/card/route'

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

const render = async (slug: string) => {
    const response = await RecapOgImage({ params: Promise.resolve({ slug }) })
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { response, bytes }
}

const fetchCard = async (slug: string, request = new Request(`http://localhost:3000${recapImagePath(slug)}`)) => {
    const response = await recapCard(request, { params: Promise.resolve({ slug }) })
    return { response, bytes: new Uint8Array(await response.arrayBuffer()) }
}

const expectPng = (response: Response, bytes: Uint8Array) => {
    expect(response.status).toBe(200)
    expect([...bytes.slice(0, 4)]).toEqual(PNG_MAGIC)
    // Satori fails soft on a bad element tree — a near-empty PNG is how a broken card looks.
    expect(bytes.byteLength).toBeGreaterThan(5_000)
}

describe('recap card routes', () => {
    let slug = ''

    beforeAll(async () => {
        await truncateAll()
        resetRateLimits()
        // A hostile name and a settled ledger in one room: the stamp, the avatar
        // row and the sanitizers all have to survive the same render.
        const room = await prisma.room.create({
            data: {
                slug: 'ski-trip-recap1',
                name: 'Їдемо до Ґанку в Києві 🎿 東京',
                emoji: encodeRoomDrawing([
                    [
                        { x: 0.15, y: 0.2 },
                        { x: 0.85, y: 0.8 },
                    ],
                ]),
                currency: 'EUR',
                locale: 'uk',
                members: {
                    create: [
                        { name: 'Ірина', token: 'tok-iryna' },
                        { name: 'Марія', token: 'tok-mariia' },
                    ],
                },
            },
            include: { members: true },
        })
        const [ana, maria] = room.members
        await prisma.expense.create({
            data: {
                roomId: room.id,
                description: 'Lift pass',
                amountMinor: 234_000n,
                currency: 'EUR',
                baseAmountMinor: 234_000n,
                fxRate: 1,
                paidById: maria.id,
                splitMode: 'EQUAL',
                date: new Date('2026-02-01T10:00:00Z'),
                shares: {
                    create: [
                        { memberId: ana.id, amountMinor: 117_000n },
                        { memberId: maria.id, amountMinor: 117_000n },
                    ],
                },
            },
        })
        await prisma.settlement.create({
            data: { roomId: room.id, fromId: ana.id, toId: maria.id, amountMinor: 117_000n },
        })
        slug = room.slug
    })

    afterAll(() => resetRateLimits())

    const expectUkrainianCard = async () => {
        const recap = await loadRecap(slug)
        expect(recap?.locale).toBe('uk')
        const card = toRecapCard(recap!, await getTranslator(recap!.locale ?? 'en'))
        expect(card).toMatchObject({
            name: 'Їдемо до Ґанку в Києві',
            stat: '1 день · 1 витрата · 2 людини',
            topPayer: 'Найбільший внесок за групу: Марія',
            settledLabel: 'Усі розрахувалися',
        })
    }

    /**
     * The check that would have caught the incident, at unit speed.
     *
     * `005a942` moved the recap under the `(product-shell)` route group. Next appends a
     * build-scoped hash to a generated metadata-image SEGMENT whenever a parent is a route group,
     * so `/r/<slug>/recap/opengraph-image` — which `recapImagePath()` returned at the time —
     * started answering 404 in production. THIS suite stayed green through all of it, because
     * every case here calls the route's default export directly and no hash can reach an export.
     * `recap.spec.ts` did go red, and e2e is not in the pre-push gate
     * (`typecheck && test && format`), so red is where it stayed.
     *
     * Nothing below renders. The claim is only that the URL the app builds names a real Route
     * Handler on disk, whose path Next serves verbatim. If `recapImagePath` is ever pointed back
     * at a generated metadata image, or at a segment nobody wrote, the gated suite fails.
     */
    it('is a Route Handler at exactly the path the app asks for', () => {
        const segment = recapImagePath('SLUG').replace('/r/SLUG/', '')
        expect(segment).not.toContain('opengraph-image')
        expect(existsSync(join(process.cwd(), 'src/app/(product-shell)/r/[slug]', segment, 'route.ts'))).toBe(true)
    })

    it('rasterizes a localized Ukrainian room through the route the share button fetches', async () => {
        await expectUkrainianCard()
        const { response, bytes } = await fetchCard(slug)
        expectPng(response, bytes)
        expect(response.headers.get('Cache-Control')).toContain('max-age=300')
    }, 30_000)

    it('answers an unknown slug with the brand card rather than a 404 or a 500', async () => {
        resetRateLimits()
        const { response, bytes } = await fetchCard('nope-123456')
        expectPng(response, bytes)
        resetRateLimits()
    }, 30_000)

    /**
     * A miss costs something, even though every slug answers 200.
     *
     * The status code is not the oracle here — the brand card versus a real recap is — so the
     * budget is what makes guessing slugs against this route expensive. The bucket is drained
     * directly rather than by rasterizing thirty brand cards: the claim is about WHO spends the
     * last token, and thirty renders would only make it slower to find out.
     */
    it('bills a miss to the shared lookup budget, and still answers 200 once it is gone', async () => {
        resetRateLimits()
        const caller = new Request(`http://localhost:3000${recapImagePath('nope-000000')}`)
        for (let i = 0; i < LOOKUP_MISS_LIMIT.capacity - 1; i++) {
            enforceRateLimit(caller, LOOKUP_MISS_LIMIT, LOOKUP_MISS_SCOPE)
        }
        expect(() => enforceRateLimitPreflight(caller, LOOKUP_MISS_LIMIT, LOOKUP_MISS_SCOPE)).not.toThrow()

        const { response, bytes } = await fetchCard('nope-000000', caller)
        expectPng(response, bytes)

        // The route spent the last token…
        expect(() => enforceRateLimitPreflight(caller, LOOKUP_MISS_LIMIT, LOOKUP_MISS_SCOPE)).toThrow()
        // …and a drained budget is still artwork, never a 429. A 429 here is the dead share
        // button again, for a member who did nothing wrong.
        const drained = await fetchCard('nope-000000', caller)
        expectPng(drained.response, drained.bytes)
        resetRateLimits()
    }, 60_000)

    /**
     * The unfurl half, unchanged. A chat client is handed this URL out of the recap page's
     * `<head>`, hash and all, so what matters is that it renders — not that anyone can spell it.
     */
    describe('the opengraph-image route', () => {
        it('renders the brand card for an unknown slug rather than a 500', async () => {
            const { response, bytes } = await render('nope-123456')
            expectPng(response, bytes)
            expect(response.headers.get('Cache-Control')).toContain('max-age=300')
        }, 30_000)

        it('rasterizes the same localized Ukrainian room, stamp and all', async () => {
            await expectUkrainianCard()
            const { response, bytes } = await render(slug)
            expectPng(response, bytes)
        }, 30_000)
    })
})
