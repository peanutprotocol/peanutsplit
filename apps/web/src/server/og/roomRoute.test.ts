/**
 * The room unfurl, rasterized for real.
 *
 * `recapRoute.test.ts` was the only rasterizing test in the repo, and it covers
 * `RecapCard` plus — through its unknown-slug case — `BrandCard`. It never
 * touches `RoomCard`, whose avatar row (the overlapping discs, the `+N` chip and
 * the dashed empty seat with its `<img>` doodle) is the composition the shared
 * primitives in `frame.tsx` were folded out of. `card.tsx` has seven consumers,
 * six of them public marketing images, so a Satori rule broken there is a blank
 * storefront rather than a type error.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { encodeRoomDrawing } from '@/lib/room-drawing'
import { prisma, truncateAll } from '@/server/test/db'
import { loadRoomCard } from '@/server/og/roomCard'
import RoomOgImage from '@/app/(product-shell)/r/[slug]/opengraph-image'

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

const render = async (slug: string) => {
    const response = await RoomOgImage({ params: Promise.resolve({ slug }) })
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { response, bytes }
}

describe('room opengraph-image', () => {
    let slug = ''

    beforeAll(async () => {
        await truncateAll()
        // Enough members to force the `+N` chip beside the empty seat, a name
        // that has to survive the sanitizer, and a non-default theme so the
        // field colours come from the catalog rather than the literals.
        const room = await prisma.room.create({
            data: {
                slug: 'ski-trip-room01',
                name: 'Їдемо до Ґанку в Києві 🎿 東京',
                emoji: encodeRoomDrawing([
                    [
                        { x: 0.15, y: 0.2 },
                        { x: 0.85, y: 0.8 },
                    ],
                ]),
                currency: 'EUR',
                theme: 'coral',
                locale: 'uk',
                members: {
                    create: ['Їрина', 'Євген', 'Олена', 'Богдан', 'Андрій', 'Марія', 'Софія', 'Тарас'].map(
                        (name, i) => ({ name, token: `tok-${i}` })
                    ),
                },
            },
            include: { members: true },
        })
        await prisma.expense.create({
            data: {
                roomId: room.id,
                description: 'Lift pass',
                amountMinor: 234_000n,
                currency: 'EUR',
                baseAmountMinor: 234_000n,
                fxRate: 1,
                paidById: room.members[0].id,
                splitMode: 'EQUAL',
                date: new Date('2026-02-01T10:00:00Z'),
                shares: { create: room.members.map((m) => ({ memberId: m.id, amountMinor: 29_250n })) },
            },
        })
        slug = room.slug
    })

    it('renders the brand card for an unknown slug rather than a 500', async () => {
        const { response, bytes } = await render('nope-654321')
        expect(response.status).toBe(200)
        expect([...bytes.slice(0, 4)]).toEqual(PNG_MAGIC)
        expect(bytes.byteLength).toBeGreaterThan(5_000)
        expect(response.headers.get('Cache-Control')).toContain('max-age=300')
        expect(response.headers.get('Cache-Control')).toContain('s-maxage=300')
        expect(response.headers.get('Cache-Control')).toContain('stale-while-revalidate=60')
    }, 30_000)

    it('rasterizes a themed room, overflow chip and empty seat and all', async () => {
        const card = await loadRoomCard(slug)
        expect(card).toMatchObject({
            name: 'Їдемо до Ґанку в Києві',
            stat: '1 витрата · наразі €2340.00',
            people: '8 людей',
            tagline: 'без реєстрації · користування безкоштовне',
        })
        expect(card?.avatars.map(({ letter }) => letter)).toEqual(['Ї', 'Є', 'О', 'Б', 'А', 'М'])

        const { response, bytes } = await render(slug)
        expect(response.status).toBe(200)
        expect([...bytes.slice(0, 4)]).toEqual(PNG_MAGIC)
        expect(bytes.byteLength).toBeGreaterThan(5_000)
    }, 30_000)
})
