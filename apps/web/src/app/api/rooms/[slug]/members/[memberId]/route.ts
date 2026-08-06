/**
 * Cast one room member as a playful, catalogued alter ego.
 *
 * Split's social model is a trusted table: anyone holding the room link can
 * record that Ana paid and can cast Ana as the Vampire Penguin. That looseness
 * is the joke, but it stays bounded. The target must be a member of THIS room
 * and the value must be a code-side allowlist key — no cross-room edits, text or
 * uploads.
 *
 * PATCH rather than PUT: the body carries one field of a member that has several.
 */
import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { conflict, memberTokenOf, notFound, readJson, respond } from '@/server/http'
import { actorFromToken, appendRoomAuditEvent, lockRoomWrite } from '@/server/history'
import { randomPersonaKey } from '@/lib/avatars'
import { effectiveAvatarPaletteKey, separatedAvatarPaletteKeys } from '@/lib/avatar-palettes'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { activeMembers, isFormerMember } from '@/lib/members'
import { balancesOf, loadRoom, toRoomState } from '@/server/roomState'
import { memberAvatarSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; memberId: string }> }

export const PATCH = (request: Request, ctx: Ctx) =>
    respond(async () => {
        // The `reaction` bucket, not `write`: picking an avatar is browsing a
        // grid, and a few taps of taste must not spend the allowance the room
        // needs for its expenses.
        enforceRateLimit(request, WRITE_LIMIT, 'reaction')
        const { slug, memberId } = await ctx.params
        const body = memberAvatarSchema.parse(await readJson(request))

        const room = await loadRoom(slug)
        const member = room.members.find((candidate) => candidate.id === memberId)
        if (!member) throw notFound('member not found')
        if (isFormerMember(member)) throw notFound('member not found')

        // Older clients used null for "automatic". Preserve compatibility, but
        // make it a concrete random pick so every phone sees the same character.
        const reroll = body.avatar === null
        const avatar = reroll
            ? randomPersonaKey(room.members.flatMap((candidate) => (candidate.avatar ? [candidate.avatar] : [])))
            : body.avatar
        // An older client sends only `avatar`; preserve the colour it cannot see
        // or edit. Its legacy null reroll is different: that explicitly asks for
        // a fresh identity, so both halves of the pair are renewed together.
        const result = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, room.id)
            const locked = await loadRoom(slug, tx)
            const target = locked.members.find((candidate) => candidate.id === memberId)
            if (!target || isFormerMember(target)) throw notFound('member not found')
            // Palette choice is a room invariant, so derive it only after taking
            // the same advisory lock used by member creation. Nullable legacy
            // rows still render a deterministic palette and must reserve it too.
            const usedPalettes = locked.members
                // Former identities keep their palette for a possible restore.
                // Exclude only the row being edited, never the ledger directory.
                .filter((candidate) => candidate.id !== target.id)
                .map((candidate) =>
                    effectiveAvatarPaletteKey(candidate.avatarPalette, candidate.avatar ?? candidate.name)
                )
            const paletteWasRequested = reroll || body.avatarPalette !== undefined
            const requestedPalette = reroll
                ? separatedAvatarPaletteKeys(1, [
                      ...usedPalettes,
                      effectiveAvatarPaletteKey(target.avatarPalette, target.avatar ?? target.name),
                  ])[0]
                : body.avatarPalette
            const nextPalette =
                requestedPalette === undefined
                    ? target.avatarPalette
                    : usedPalettes.includes(requestedPalette)
                      ? separatedAvatarPaletteKeys(1, usedPalettes, [
                            effectiveAvatarPaletteKey(target.avatarPalette, target.avatar ?? target.name),
                        ])[0]
                      : requestedPalette
            const changed = target.avatar !== avatar || target.avatarPalette !== nextPalette
            if (changed) {
                await tx.member.update({
                    where: { id: memberId },
                    data: { avatar, ...(paletteWasRequested ? { avatarPalette: nextPalette } : {}) },
                })
                await appendRoomAuditEvent({
                    tx,
                    request,
                    roomId: room.id,
                    actor: actorFromToken(locked.members, memberTokenOf(request)),
                    event: {
                        kind: 'member_avatar_updated',
                        subjectType: 'member',
                        subjectId: target.id,
                        before: { name: target.name, avatar: target.avatar, avatarPalette: target.avatarPalette },
                        after: { name: target.name, avatar, avatarPalette: nextPalette },
                    },
                })
            }
            return { changed, state: toRoomState(await loadRoom(slug, tx)) }
        })
        // After the commit, like every other write — a persona that only travelled
        // on the poll would arrive up to 45s late on a phone holding an open
        // stream, slower than it managed before the stream existed.
        if (result.changed) publish(room.id)
        return result.state
    })

/**
 * Mark one exact-zero active identity Former. This never deletes a member or a
 * ledger row. Former identities remain in RoomState so historical rows and a
 * balance reopened by a later correction stay resolvable and settleable.
 */
export const DELETE = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug, memberId } = await ctx.params
        const initial = await loadRoom(slug)

        const result = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, initial.id)
            const room = await loadRoom(slug, tx)
            const member = room.members.find((candidate) => candidate.id === memberId)
            if (!member) throw notFound('member not found')
            // Lost-response retry: lifecycle state already reached, so return
            // the authoritative room without extending or duplicating anything.
            if (isFormerMember(member)) return { changed: false, state: toRoomState(room) }

            if (activeMembers(room.members).length <= 1) {
                throw conflict('the last active member cannot leave the room', 'LAST_ACTIVE_MEMBER')
            }
            const balance = balancesOf(room).get(member.id) ?? 0n
            if (balance !== 0n) {
                throw conflict('settle this member to exactly zero before removing them', 'MEMBER_BALANCE_NOT_ZERO')
            }

            const removedAt = new Date()
            await tx.member.update({ where: { id: member.id }, data: { removedAt } })
            // Removing lifecycle proof also removes every delivery channel. The
            // member and every financial/social fact remain intact.
            await tx.pushSubscription.deleteMany({ where: { roomId: room.id, memberId: member.id } })
            await appendRoomAuditEvent({
                tx,
                request,
                roomId: room.id,
                actor: actorFromToken(room.members, memberTokenOf(request)),
                event: {
                    kind: 'member_removed',
                    subjectType: 'member',
                    subjectId: member.id,
                    before: {
                        id: member.id,
                        name: member.name,
                        avatar: member.avatar,
                        avatarPalette: member.avatarPalette,
                        provisional: member.provisional,
                        removedAt: null,
                    },
                    after: {
                        id: member.id,
                        name: member.name,
                        avatar: member.avatar,
                        avatarPalette: member.avatarPalette,
                        provisional: member.provisional,
                        removedAt,
                    },
                    detail: { lifecycle: 'former', historyPreserved: true },
                },
            })
            return { changed: true, state: toRoomState(await loadRoom(slug, tx)) }
        })
        if (result.changed) publish(initial.id)
        return result.state
    })
