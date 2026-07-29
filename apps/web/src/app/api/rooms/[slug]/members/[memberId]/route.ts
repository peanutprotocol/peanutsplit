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
import { conflict, notFound, readJson, respond } from '@/server/http'
import { randomPersonaKey } from '@/lib/avatars'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { canRemoveMember, loadRoom, loadRoomById, toRoomState } from '@/server/roomState'
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
        const avatar = body.avatar ?? randomPersonaKey(member.avatar)
        await prisma.member.update({ where: { id: memberId }, data: { avatar } })
        const state = toRoomState(await loadRoomById(room.id))
        // After the commit, like every other write — a persona that only travelled
        // on the poll would arrive up to 45s late on a phone holding an open
        // stream, slower than it managed before the stream existed.
        publish(room.id)
        return state
    })

/**
 * Remove only an untouched on-behalf placeholder. Any claim, subscription,
 * expense, share, settlement or reaction makes the identity permanent. Counts
 * include soft-deleted rows, so removal can never erase or redistribute history.
 */
export const DELETE = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug, memberId } = await ctx.params
        const initial = await loadRoom(slug)
        assertWritable(initial)

        const state = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${initial.id}, 0))`
            const room = await loadRoom(slug, tx)
            assertWritable(room)
            const member = room.members.find((candidate) => candidate.id === memberId)
            if (!member) throw notFound('member not found')
            if (!canRemoveMember(member))
                throw conflict('this member has room history and cannot be removed', 'MEMBER_HAS_HISTORY')

            await tx.member.delete({ where: { id: member.id } })
            return toRoomState(await loadRoom(slug, tx))
        })
        publish(initial.id)
        return state
    })
