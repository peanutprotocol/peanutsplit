import { actorFromToken } from '@/server/history'
import { errorEnvelope, json, memberTokenOf } from '@/server/http'
import {
    appendSetCookieHeaders,
    assertInstallHandoffSameOrigin,
    installHandoffTokenFrom,
    prepareInstallHandoff,
    preparedInstallHandoffCookieHeaders,
    readEmptyInstallHandoffCommand,
} from '@/server/installHandoff'
import { WRITE_LIMIT, enforceRateLimit, meterRoomLookup } from '@/server/rateLimit'
import { loadRoom } from '@/server/roomState'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

/**
 * Prepare one current-room bridge before Safari opens its Add to Home Screen
 * instructions. A supplied member token is proof and must still be active;
 * without one the room is restored but the new app chooses its person again.
 */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
    try {
        assertInstallHandoffSameOrigin(request)
        // Unlike room/member creation this row expires and is replaced by the
        // next prepare from the same browser. Keep a busy shared Wi-Fi from
        // exhausting the intentionally tighter durable-row creation budget.
        enforceRateLimit(request, WRITE_LIMIT, 'install-handoff-prepare')
        await readEmptyInstallHandoffCommand(request)

        const { slug } = await ctx.params
        const room = await meterRoomLookup(request, () => loadRoom(slug))
        // Preserves the app-wide proof rule: missing stays anonymous, but an
        // invalid or Former supplied token is a concrete false claim and 403s.
        const suppliedMemberToken = memberTokenOf(request)
        const actor = actorFromToken(room.members, suppliedMemberToken)
        const token = await prepareInstallHandoff({
            roomId: room.id,
            memberId: actor.memberId,
            memberToken: actor.memberId ? suppliedMemberToken : null,
            previousToken: installHandoffTokenFrom(request),
        })

        return appendSetCookieHeaders(json({ prepared: true }, 201), preparedInstallHandoffCookieHeaders(token))
    } catch (error) {
        return errorEnvelope(error)
    }
}
