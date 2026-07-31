import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { readJson, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit, meterRoomLookup } from '@/server/rateLimit'
import { loadRoom, loadRoomById, roomStateBySlug, toRoomState } from '@/server/roomState'
import { assertWritable } from '@/server/rooms'
import { roomSettingsSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export const GET = (request: Request, ctx: Ctx) =>
    respond(async () => {
        const { slug } = await ctx.params
        return await meterRoomLookup(request, () => roomStateBySlug(slug))
    })

/**
 * The room's editable presentation: its display name, drawing and palette. Never
 * its slug; a rename changes what the room is called, not the link people saved.
 *
 * No member token, deliberately: the slug is the credential here, exactly as it
 * is for adding an expense or recording a settlement. Impersonation inside a
 * room is tolerated by design — the room is a link in a group chat and shared
 * presentation edits are visible to everyone. A token gate would make these
 * low-consequence writes the only room writes a link-holder cannot make.
 * (Contrast reactions, which are social identity and do demand proof — see
 * `api/expenses/[id]/reactions`.)
 */
export const PATCH = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'write')
        const { slug } = await ctx.params
        const body = roomSettingsSchema.parse(await readJson(request))
        const room = await loadRoom(slug)
        assertWritable(room)

        await prisma.room.update({
            where: { id: room.id },
            data: {
                ...(body.name !== undefined ? { name: body.name } : {}),
                ...(body.theme !== undefined ? { theme: body.theme } : {}),
                ...(body.emoji !== undefined ? { emoji: body.emoji } : {}),
            },
        })
        const state = toRoomState(await loadRoomById(room.id))
        // Same placement rule as every other write: after the row committed, so
        // the refetch it triggers can only see the new settings. Without it a
        // room edit is the SLOWEST write in the product — a peer holding an open
        // stream polls at 45s, where before the stream existed it polled at 8s.
        publish(room.id)
        return state
    })
