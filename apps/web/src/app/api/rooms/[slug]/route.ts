import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { readJson, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom, loadRoomById, roomStateBySlug, toRoomState } from '@/server/roomState'
import { assertWritable } from '@/server/rooms'
import { roomThemeSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export const GET = (_request: Request, ctx: Ctx) => respond(async () => roomStateBySlug((await ctx.params).slug))

/**
 * The room's palette.
 *
 * No member token, deliberately: the slug is the credential here, exactly as it
 * is for adding an expense or recording a settlement. Impersonation inside a
 * room is tolerated by design — the room is a link in a group chat, someone
 * repainting it is visible to everyone and one tap to undo, and a token gate
 * would make the least consequential write in the product the only one a
 * link-holder cannot make. (Contrast reactions, which are social identity and do
 * demand proof — see `api/expenses/[id]/reactions`.)
 */
export const PATCH = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug } = await ctx.params
        const body = roomThemeSchema.parse(await readJson(request))
        const room = await loadRoom(slug)
        assertWritable(room)

        await prisma.room.update({ where: { id: room.id }, data: { theme: body.theme ?? null } })
        const state = toRoomState(await loadRoomById(room.id))
        // Same placement rule as every other write: after the row committed, so
        // the refetch it triggers can only see the new palette. Without it a
        // repaint is the SLOWEST write in the product — a peer holding an open
        // stream polls at 45s, where before the stream existed it polled at 8s.
        publish(room.id)
        return state
    })
