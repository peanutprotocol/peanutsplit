/**
 * Is this device's push channel on for THIS room?
 *
 * The browser can only answer "there is a subscription for this origin", which
 * every room on the device shares. Only the server knows which rooms that
 * endpoint is actually registered for, so the client has to ask.
 *
 * POST, and the endpoint is never a query parameter: an FCM or WNS endpoint
 * embeds the device's registration token, and a URL would copy it into every
 * access log, proxy trace and Referer header on the way.
 */
import { prisma } from '@/server/db'
import { readJson, respond } from '@/server/http'
import { assertProvenMember, loadRoom } from '@/server/roomState'
import { enforceRateLimit, meterRoomLookup, WRITE_LIMIT } from '@/server/rateLimit'
import { pushStatusSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export const POST = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'push-status')
        const { slug } = await ctx.params
        const body = pushStatusSchema.parse(await readJson(request))
        // A guessed slug 404s here and a real slug with a bad token 403s, which is
        // a room-existence oracle. Its own 120/hour bucket would have widened the
        // 30/hour the miss limiter exists to enforce, so the miss goes there.
        const room = await meterRoomLookup(request, () => loadRoom(slug))
        // Proof of membership as the delete does, but no `assertWritable`:
        // reading your own notification state has to work in an archived room,
        // where turning it off is the one thing left to do.
        assertProvenMember(room, body.memberId, body.memberToken)

        const row = await prisma.pushSubscription.findUnique({
            where: { endpoint_roomId: { endpoint: body.endpoint, roomId: room.id } },
            select: { id: true },
        })

        return { subscribed: row !== null }
    })
