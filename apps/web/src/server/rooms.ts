/** Room + member writes. Kept out of the route handlers so the maths and the
 *  HTTP layer stay separable. */
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { conflict } from '@/server/http'
import { actorForMember, appendRoomAuditEvent, type AuditActor } from '@/server/history'
import { randomPersonaKey } from '@/lib/avatars'
import { effectiveAvatarPaletteKey, randomAvatarPaletteKey, separatedAvatarPaletteKeys } from '@/lib/avatar-palettes'
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
    locale: string | null = null,
    request: Request = new Request('http://localhost')
): Promise<{ room: RoomWithRelations } & CreatedMember> {
    const token = memberToken()

    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
        try {
            return await prisma.$transaction(async (tx) => {
                const created = await tx.room.create({
                    data: {
                        slug: roomSlug(body.name),
                        name: body.name,
                        emoji: body.emoji ?? null,
                        currency: body.currency,
                        locale,
                        members: {
                            create: {
                                name: body.creatorName,
                                token,
                                avatar: randomPersonaKey(),
                                avatarPalette: randomAvatarPaletteKey(),
                            },
                        },
                    },
                    include: { members: true },
                })
                const creator = created.members[0]
                await appendRoomAuditEvent({
                    tx,
                    request,
                    roomId: created.id,
                    actor: actorForMember(creator),
                    event: {
                        kind: 'room_created',
                        subjectType: 'room',
                        subjectId: created.id,
                        after: {
                            room: {
                                id: created.id,
                                slug: created.slug,
                                name: created.name,
                                emoji: created.emoji,
                                currency: created.currency,
                                theme: created.theme,
                                locale: created.locale,
                            },
                            creator: { id: creator.id, name: creator.name },
                        },
                    },
                })
                return {
                    room: await loadRoom(created.slug, tx),
                    memberId: creator.id,
                    memberToken: token,
                }
            })
        } catch (err) {
            // Two rooms named the same can collide on the random tail; just re-roll.
            if (isUniqueViolation(err, 'slug')) continue
            throw err
        }
    }
    throw conflict('could not allocate a room link, please try again', 'SLUG_EXHAUSTED')
}

export async function addMember(
    room: RoomWithRelations,
    name: string,
    provisional = false,
    request: Request = new Request('http://localhost'),
    actor: AuditActor = { memberId: null, memberName: null }
): Promise<CreatedMember> {
    const token = memberToken()

    return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${room.id}, 0))`
        const added = await addMemberInLockedTransaction(tx, room.id, name, token, provisional)
        const member = await tx.member.findUniqueOrThrow({ where: { id: added.memberId } })
        await appendRoomAuditEvent({
            tx,
            request,
            roomId: room.id,
            actor: provisional ? actor : actorForMember(member),
            event: {
                kind: provisional ? 'member_added' : 'member_joined',
                subjectType: 'member',
                subjectId: member.id,
                after: {
                    id: member.id,
                    name: member.name,
                    avatar: member.avatar,
                    avatarPalette: member.avatarPalette,
                    provisional: member.provisional,
                },
            },
        })
        return added
    })
}

/**
 * Create a member after the caller has taken the room advisory lock.
 *
 * Kept public for the expense route, whose new-payer member and expense have to
 * be one transaction. It intentionally does not return room state or publish:
 * those are responsibilities of the outer write.
 */
export async function addMemberInLockedTransaction(
    tx: Prisma.TransactionClient,
    roomId: string,
    name: string,
    token = memberToken(),
    provisional = false
): Promise<CreatedMember> {
    // The name rule is case-insensitive but PostgreSQL cannot express that
    // invariant with the existing schema. Every caller holds the room lock.
    const duplicate = await tx.member.findFirst({
        where: { roomId, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
    })
    if (duplicate) throw conflict(`${name} is already in this room`, 'DUPLICATE_MEMBER_NAME')
    const existingMembers = await tx.member.findMany({
        where: { roomId, removedAt: null },
        select: { name: true, avatar: true, avatarPalette: true },
    })
    const usedAvatars = existingMembers.flatMap((member) => (member.avatar ? [member.avatar] : []))
    const usedPalettes = existingMembers.map((member) =>
        effectiveAvatarPaletteKey(member.avatarPalette, member.avatar ?? member.name)
    )

    const member = await tx.member.create({
        data: {
            roomId,
            name,
            token,
            avatar: randomPersonaKey(usedAvatars),
            avatarPalette: separatedAvatarPaletteKeys(1, usedPalettes)[0],
            provisional,
        },
    })
    return { memberId: member.id, memberToken: token }
}
