/**
 * The card route, rasterized for real, all six kinds.
 *
 * Same job `recapRoute.test.ts` does for the recap: a missing `display: flex` or
 * a `gap` is a runtime throw in Satori, not a type error, and the share button
 * fetches these exact bytes. Consuming the body is the point — `ImageResponse`
 * renders lazily, so a test that only reads the status code proves nothing.
 *
 * Different call shape from `recapRoute.test.ts`, which invokes a default export
 * with `params`. This is a Route Handler, so each case builds a real `Request` —
 * it is the only way to carry `?a=&p=` and the only way the miss budget sees a
 * caller at all.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CARD_KINDS } from '@/lib/achievements-contract'
import { prisma, truncateAll } from '@/server/test/db'
import { enforceRateLimitPreflight, LOOKUP_MISS_LIMIT, resetRateLimits } from '@/server/rateLimit'
import { GET } from '@/app/r/[slug]/card/[kind]/route'

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]
const SLUG = 'card-route-tests1'

const call = async (slug: string, kind: string, query = '') => {
    const url = `http://localhost:3000/r/${slug}/card/${kind}${query}`
    const response = await GET(new Request(url), { params: Promise.resolve({ slug, kind }) })
    return { response, bytes: new Uint8Array(await response.arrayBuffer()) }
}

const expectPng = (response: Response, bytes: Uint8Array) => {
    expect(response.status).toBe(200)
    expect([...bytes.slice(0, 4)]).toEqual(PNG_MAGIC)
    expect(bytes.byteLength).toBeGreaterThan(5_000)
    expect(response.headers.get('Cache-Control')).toContain('max-age=300')
}

describe('achievement card route', () => {
    beforeAll(async () => {
        await truncateAll()
        resetRateLimits()
        const room = await prisma.room.create({
            data: {
                slug: SLUG,
                // A hostile name, a legacy emoji emblem and a non-default theme, so
                // the sanitizers and the theme catalog are on the same render.
                name: 'Ski trip 🎿 東京 and a rather long tail besides',
                emoji: '🎿',
                currency: 'EUR',
                theme: 'coral',
                locale: 'pt-BR',
                members: {
                    create: Array.from({ length: 11 }, (_, i) => ({
                        name: `Member ${i}`,
                        token: `tok-${i}`,
                        avatar: i === 0 ? null : ['wizard-frog', 'disco-octopus', 'tea-dragon', 'cozy-ghost'][i % 4],
                    })),
                },
            },
            include: { members: { orderBy: { createdAt: 'asc' } } },
        })
        const [first, second] = room.members
        for (const [i, currency] of ['EUR', 'JPY', 'THB', 'BRL'].entries()) {
            await prisma.expense.create({
                data: {
                    roomId: room.id,
                    description: `Row ${i}`,
                    amountMinor: 123_450n,
                    currency,
                    baseAmountMinor: 123_450n,
                    fxRate: 1,
                    paidById: first.id,
                    splitMode: 'EQUAL',
                    date: new Date(`2026-02-0${i + 1}T10:00:00Z`),
                    shares: { create: [{ memberId: first.id, amountMinor: 123_450n }] },
                },
            })
        }
        await prisma.settlement.create({
            data: { roomId: room.id, fromId: second.id, toId: first.id, amountMinor: 61_725n },
        })
    })

    afterAll(() => resetRateLimits())

    it.each(CARD_KINDS)(
        'rasterizes the %s card',
        async (kind) => {
            const query = kind === 'alterego' ? '?a=theCloser&p=wizard-frog' : ''
            const { response, bytes } = await call(SLUG, kind, query)
            expectPng(response, bytes)
        },
        30_000
    )

    it('404s a kind that is not in the catalog', async () => {
        const response = await GET(new Request('http://localhost:3000/r/x/card/streak'), {
            params: Promise.resolve({ slug: SLUG, kind: 'streak' }),
        })
        expect(response.status).toBe(404)
    })

    it('404s an alter ego with a missing or bogus award or persona', async () => {
        for (const query of [
            '',
            '?a=theCloser',
            '?p=wizard-frog',
            '?a=bestPayer&p=wizard-frog',
            '?a=theCloser&p=nope',
        ]) {
            const url = `http://localhost:3000/r/${SLUG}/card/alterego${query}`
            const response = await GET(new Request(url), {
                params: Promise.resolve({ slug: SLUG, kind: 'alterego' }),
            })
            expect(response.status).toBe(404)
        }
    })

    it('answers an unknown slug with the brand card, and bills it to the miss budget', async () => {
        resetRateLimits()
        // Thirty-one in a row: one more than `LOOKUP_MISS_LIMIT`, so the budget is
        // provably drained by the end. Every one of them still answers 200 — a 429
        // here would be a dead share button, and the oracle closes because a miss
        // COSTS something, not because the answer changes.
        for (let i = 0; i < 31; i++) {
            const { response, bytes } = await call('nope-000000', 'crew')
            expectPng(response, bytes)
        }
        expect(() =>
            enforceRateLimitPreflight(new Request('http://localhost:3000/x'), LOOKUP_MISS_LIMIT, 'room-lookup-miss')
        ).toThrow()
        resetRateLimits()
    }, 60_000)
})
