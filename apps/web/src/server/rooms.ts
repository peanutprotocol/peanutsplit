/** Room + member writes. Kept out of the route handlers so the maths and the
 *  HTTP layer stay separable. */
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { conflict } from '@/server/http'
import { randomPersonaKey } from '@/lib/avatars'
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

/**
 * `locale` is the language the creator's screen was in. It is passed in rather
 * than read here, for the reason at the top of this file: resolving a request
 * context is the HTTP layer's job, and this module has to stay callable without
 * one. The route reads it — see `server/locale.ts` for why the room has to
 * remember at all.
 */
export async function createRoom(
    body: CreateRoomBody,
    locale: string | null = null
): Promise<{ room: RoomWithRelations } & CreatedMember> {
    const token = memberToken()

    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
        try {
            const created = await prisma.room.create({
                data: {
                    slug: roomSlug(body.name),
                    name: body.name,
                    emoji: body.emoji ?? null,
                    currency: body.currency,
                    locale,
                    members: { create: { name: body.creatorName, token, avatar: randomPersonaKey() } },
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
    const token = memberToken()

    return prisma.$transaction(async (tx) => {
        // The name rule is case-insensitive but PostgreSQL cannot express that
        // invariant with the existing schema. Serialize joins per room so two
        // requests for Ana/ana cannot both pass the lookup before either inserts.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${room.id}, 0))`

        const current = await tx.room.findUnique({ where: { id: room.id }, select: { archivedAt: true } })
        if (current?.archivedAt) throw conflict('this room is archived', 'ROOM_ARCHIVED')

        // The join gate offers existing members by name — a duplicate is nearly
        // always someone who meant to pick themselves, so say so instead of
        // silently forking.
        const duplicate = await tx.member.findFirst({
            where: { roomId: room.id, name: { equals: name, mode: 'insensitive' } },
            select: { id: true },
        })
        if (duplicate) throw conflict(`${name} is already in this room`, 'DUPLICATE_MEMBER_NAME')

        const member = await tx.member.create({ data: { roomId: room.id, name, token, avatar: randomPersonaKey() } })
        return { memberId: member.id, memberToken: token }
    })
}

export function assertWritable(room: RoomWithRelations): void {
    if (room.archivedAt) throw conflict('this room is archived', 'ROOM_ARCHIVED')
}
