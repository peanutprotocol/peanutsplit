/**
 * The recap image route, rasterized for real.
 *
 * This is the one test that proves the Satori rules in `recapCardArt.tsx` are
 * actually obeyed — a missing `display: flex` or a `gap` is a runtime throw, not
 * a type error, and the share button fetches these exact bytes. Consuming the
 * body is the point: `new ImageResponse()` renders lazily, so a test that only
 * checks the status code proves nothing.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { encodeRoomDrawing } from '@/lib/room-drawing'
import { prisma, truncateAll } from '@/server/test/db'
import RecapOgImage from '@/app/r/[slug]/recap/opengraph-image'

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

const render = async (slug: string) => {
    const response = await RecapOgImage({ params: Promise.resolve({ slug }) })
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { response, bytes }
}

describe('recap opengraph-image', () => {
    let slug = ''

    beforeAll(async () => {
        await truncateAll()
        // A hostile name and a settled ledger in one room: the stamp, the avatar
        // row and the sanitizers all have to survive the same render.
        const room = await prisma.room.create({
            data: {
                slug: 'ski-trip-recap1',
                name: 'Ski trip 🎿 東京',
                emoji: encodeRoomDrawing([
                    [
                        { x: 0.15, y: 0.2 },
                        { x: 0.85, y: 0.8 },
                    ],
                ]),
                currency: 'EUR',
                members: {
                    create: [
                        { name: 'Ana', token: 'tok-ana' },
                        { name: 'María', token: 'tok-maria' },
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

    it('renders the brand card for an unknown slug rather than a 500', async () => {
        const { response, bytes } = await render('nope-123456')
        expect(response.status).toBe(200)
        expect([...bytes.slice(0, 4)]).toEqual(PNG_MAGIC)
        expect(bytes.byteLength).toBeGreaterThan(5_000)
        expect(response.headers.get('Cache-Control')).toContain('max-age=300')
    }, 30_000)

    it('rasterizes a settled room, stamp and all', async () => {
        const { response, bytes } = await render(slug)
        expect(response.status).toBe(200)
        expect([...bytes.slice(0, 4)]).toEqual(PNG_MAGIC)
        expect(bytes.byteLength).toBeGreaterThan(5_000)
    }, 30_000)
})
