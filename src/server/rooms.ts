/** Room + member writes. Kept out of the route handlers so the maths and the
 *  HTTP layer stay separable. */
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { conflict } from '@/server/http'
import { memberToken, roomSlug } from '@/server/slug'
import { loadRoom, type RoomWithRelations } from '@/server/roomState'
import type { CreateRoomBody } from '@/server/validation'

const SLUG_ATTEMPTS = 5

const isUniqueViolation = (err: unknown, target: string) =>
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    String((err.meta as { target?: string[] } | undefined)?.target ?? '').includes(target)

export interface CreatedMember {
    memberId: string
    memberToken: string
}

export async function createRoom(body: CreateRoomBody): Promise<{ room: RoomWithRelations } & CreatedMember> {
    const token = memberToken()

    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
        try {
            const created = await prisma.room.create({
                data: {
                    slug: roomSlug(body.name),
                    name: body.name,
                    emoji: body.emoji ?? null,
                    currency: body.currency,
                    members: { create: { name: body.creatorName, token } },
                },
                include: { members: true },
            })
            return {
                room: await loadRoom(created.slug),
                memberId: created.members[0].id,
                memberToken: token,
            }
        } catch (err) {
            // Two rooms named the same can collide on the random tail; just re-roll.
            if (isUniqueViolation(err, 'slug')) continue
            throw err
        }
    }
    throw conflict('could not allocate a room link, please try again', 'SLUG_EXHAUSTED')
}

export async function addMember(room: RoomWithRelations, name: string): Promise<CreatedMember> {
    if (room.archivedAt) throw conflict('this room is archived', 'ROOM_ARCHIVED')
    // The join gate offers existing members by name — a duplicate is nearly always
    // someone who meant to pick themselves, so say so instead of silently forking.
    if (room.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
        throw conflict(`${name} is already in this room`, 'DUPLICATE_MEMBER_NAME')
    }
    const token = memberToken()
    const member = await prisma.member.create({ data: { roomId: room.id, name, token } })
    return { memberId: member.id, memberToken: token }
}

export function assertWritable(room: RoomWithRelations): void {
    if (room.archivedAt) throw conflict('this room is archived', 'ROOM_ARCHIVED')
}
