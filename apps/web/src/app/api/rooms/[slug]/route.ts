import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { memberTokenOf, readJson, respond } from '@/server/http'
import { actorFromToken, appendRoomAuditEvent, lockRoomWrite } from '@/server/history'
import { WRITE_LIMIT, enforceRateLimit, meterRoomLookup } from '@/server/rateLimit'
import { loadRoom, roomStateBySlug, toRoomState } from '@/server/roomState'
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
        const initial = await loadRoom(slug)
        assertWritable(initial)
        const result = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, initial.id)
            const room = await loadRoom(slug, tx)
            assertWritable(room)
            const before = { name: room.name, theme: room.theme, emoji: room.emoji }
            const after = {
                name: body.name ?? room.name,
                theme: body.theme === undefined ? room.theme : body.theme,
                emoji: body.emoji === undefined ? room.emoji : body.emoji,
            }
            const changed = before.name !== after.name || before.theme !== after.theme || before.emoji !== after.emoji
            if (changed) {
                const changedFields = (['name', 'theme', 'emoji'] as const).filter(
                    (field) => before[field] !== after[field]
                )
                await tx.room.update({
                    where: { id: room.id },
                    data: {
                        ...(body.name !== undefined ? { name: body.name } : {}),
                        ...(body.theme !== undefined ? { theme: body.theme } : {}),
                        ...(body.emoji !== undefined ? { emoji: body.emoji } : {}),
                    },
                })
                await appendRoomAuditEvent({
                    tx,
                    request,
                    roomId: room.id,
                    actor: actorFromToken(room.members, memberTokenOf(request)),
                    event: {
                        kind: 'room_settings_updated',
                        subjectType: 'room',
                        subjectId: room.id,
                        before,
                        after,
                        detail: { changedFields },
                    },
                })
            }
            return { changed, state: toRoomState(await loadRoom(slug, tx)) }
        })
        // Same placement rule as every other write: after the row committed, so
        // the refetch it triggers can only see the new settings. Without it a
        // room edit is the SLOWEST write in the product — a peer holding an open
        // stream polls at 45s, where before the stream existed it polled at 8s.
        if (result.changed) publish(initial.id)
        return result.state
    })
