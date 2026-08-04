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
import { canRemoveMember, loadRoom, toRoomState } from '@/server/roomState'
import { assertWritable } from '@/server/rooms'
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
        assertWritable(room)
        const member = room.members.find((candidate) => candidate.id === memberId)
        if (!member) throw notFound('member not found')

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
            assertWritable(locked)
            const target = locked.members.find((candidate) => candidate.id === memberId)
            if (!target) throw notFound('member not found')
            // Palette choice is a room invariant, so derive it only after taking
            // the same advisory lock used by member creation. Nullable legacy
            // rows still render a deterministic palette and must reserve it too.
            const usedPalettes = locked.members
                .filter((candidate) => candidate.id !== target.id && candidate.removedAt === null)
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
 * Remove only an untouched roster-added name. Any subscription, expense,
 * share, settlement or reaction makes the ledger identity permanent. Selecting
 * the name on a device does not. Counts include soft-deleted rows, so removal
 * can never erase or redistribute history.
 */
export const DELETE = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug, memberId } = await ctx.params
        const initial = await loadRoom(slug)
        assertWritable(initial)

        const state = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, initial.id)
            const room = await loadRoom(slug, tx)
            assertWritable(room)
            const member = room.members.find((candidate) => candidate.id === memberId)
            if (!member) throw notFound('member not found')
            if (!canRemoveMember(member))
                throw conflict('this member has room history and cannot be removed', 'MEMBER_HAS_HISTORY')

            await tx.member.delete({ where: { id: member.id } })
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
                    },
                },
            })
            return toRoomState(await loadRoom(slug, tx))
        })
        publish(initial.id)
        return state
    })
