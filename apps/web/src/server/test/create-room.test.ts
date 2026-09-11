import { beforeEach, describe, expect, it } from 'vitest'
import { POST as postRoom } from '@/app/api/rooms/route'
import { POST as claimMember } from '@/app/api/rooms/[slug]/members/[memberId]/claim/route'
import type { ApiError, RoomStateWithMember } from '@/lib/api-types'
import { encodeRoomDrawing } from '@/lib/room-drawing'
import { resetRateLimits } from '@/server/rateLimit'
import { createRoom } from '@/server/rooms'
import { createRoomSchema } from '@/server/validation'
import { prisma, truncateAll } from '@/server/test/db'

const roomInput = { name: 'Weekend trip', currency: 'EUR', creatorName: 'Ana' }

async function requestRoom<T = RoomStateWithMember>(overrides: Record<string, unknown> = {}) {
    const response = await postRoom(
        new Request('http://localhost/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: 'device-id=creator-device' },
            body: JSON.stringify({ ...roomInput, ...overrides }),
        })
    )
    return { status: response.status, body: (await response.json()) as T }
}

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
})

describe('creating a room with its people', () => {
    it('returns the complete roster with only the creator identity token', async () => {
        const { status, body } = await requestRoom({ memberNames: ['  Bea ', 'Jose\u0301'] })

        expect(status).toBe(201)
        expect(body.members.map((member) => member.name)).toEqual(['Ana', 'Bea', 'José'])
        expect(body.members.find((member) => member.id === body.memberId)?.name).toBe('Ana')

        const members = await prisma.member.findMany({ where: { roomId: body.room.id } })
        const creator = members.find((member) => member.id === body.memberId)
        expect(creator).toMatchObject({ name: 'Ana', token: body.memberToken, provisional: false })
        expect(new Set(members.map((member) => member.token)).size).toBe(3)
        for (const member of members.filter((member) => member.id !== body.memberId)) {
            expect(member.provisional).toBe(true)
            expect(JSON.stringify(body)).not.toContain(member.token)
        }
        expect(body.members.every((member) => !('token' in member) && !('memberToken' in member))).toBe(true)
        expect(Object.keys(body.balances).sort()).toEqual(members.map((member) => member.id).sort())
        expect(Object.values(body.balances)).toEqual(['0', '0', '0'])
    })

    it('records creation and every roster addition as the creator on the same device', async () => {
        const { body } = await requestRoom({ memberNames: ['Bea', 'Carlos'] })
        const events = await prisma.roomAuditEvent.findMany({
            where: { roomId: body.room.id },
            orderBy: { id: 'asc' },
        })

        expect(events.map((event) => event.action)).toEqual(['room_created', 'member_added', 'member_added'])
        expect(events.every((event) => event.actorMemberId === body.memberId && event.actorMemberName === 'Ana')).toBe(
            true
        )
        expect(events.map((event) => event.deviceOrdinal)).toEqual([1, 1, 1])
        for (const event of events.slice(1)) {
            const member = body.members.find((candidate) => candidate.id === event.subjectId)
            expect(event.subjectType).toBe('member')
            expect(event.after).toEqual({
                id: member?.id,
                name: member?.name,
                avatar: member?.avatar,
                avatarPalette: member?.avatarPalette,
                provisional: true,
            })
        }
        const snapshots = JSON.stringify(events.map((event) => event.after))
        const members = await prisma.member.findMany({ where: { roomId: body.room.id } })
        for (const member of members) expect(snapshots).not.toContain(member.token)
    })

    it.each([
        { creatorName: 'Ana', memberNames: ['Bea', ' aNA '] },
        { creatorName: 'Ana', memberNames: ['Bea', 'Carlos', ' bEA '] },
        { creatorName: 'José', memberNames: ['Bea', 'JOSE\u0301'] },
    ])('rolls back the room and prior additions for duplicate names: $memberNames', async (input) => {
        const { status, body } = await requestRoom<ApiError>(input)

        expect(status).toBe(409)
        expect(body.error.code).toBe('DUPLICATE_MEMBER_NAME')
        expect(await prisma.room.count()).toBe(0)
        expect(await prisma.member.count()).toBe(0)
        expect(await prisma.roomAuditEvent.count()).toBe(0)
    })

    it('rejects an invalid drafted name without creating a room', async () => {
        const { status, body } = await requestRoom<ApiError>({ memberNames: ['Bea', '  '] })

        expect(status).toBe(400)
        expect(body.error.code).toBe('VALIDATION_ERROR')
        expect(await prisma.room.count()).toBe(0)
        expect(await prisma.member.count()).toBe(0)
        expect(await prisma.roomAuditEvent.count()).toBe(0)
    })

    it('allows a drafted person to select their own identity without replacing the creator', async () => {
        const { body: created } = await requestRoom({ memberNames: ['Bea'] })
        const bea = created.members.find((member) => member.name === 'Bea')!
        const response = await claimMember(
            new Request(`http://localhost/api/rooms/${created.room.slug}/members/${bea.id}/claim`, {
                method: 'POST',
            }),
            { params: Promise.resolve({ slug: created.room.slug, memberId: bea.id }) }
        )
        const claimed = (await response.json()) as RoomStateWithMember

        expect(response.status).toBe(200)
        expect(claimed.memberId).toBe(bea.id)
        expect(claimed.memberToken).not.toBe(created.memberToken)
        expect(claimed.members).toHaveLength(2)
        expect(await prisma.member.findUnique({ where: { id: created.memberId } })).toMatchObject({
            name: 'Ana',
            token: created.memberToken,
            provisional: false,
        })
        expect(await prisma.member.findUnique({ where: { id: bea.id } })).toMatchObject({
            name: 'Bea',
            token: claimed.memberToken,
            provisional: true,
        })
    })

    it('preserves the locale, currency, and custom drawing while adding the roster', async () => {
        const emoji = encodeRoomDrawing([[{ x: 0.5, y: 0.5 }]])
        const body = createRoomSchema.parse({ ...roomInput, emoji, currency: 'ars', memberNames: ['Bea'] })
        const { room } = await createRoom(body, 'es')

        expect(room).toMatchObject({ locale: 'es', currency: 'ARS', emoji })
        expect(room.members.map((member) => member.name)).toEqual(['Ana', 'Bea'])
    })

    it('creates a roster with more than twenty people', async () => {
        const memberNames = Array.from({ length: 25 }, (_, index) => `Person ${index + 1}`)
        const { status, body } = await requestRoom({ memberNames })

        expect(status).toBe(201)
        expect(body.members.map((member) => member.name)).toEqual(['Ana', ...memberNames])
        expect(body.members.find((member) => member.id === body.memberId)?.name).toBe('Ana')
    })
})
