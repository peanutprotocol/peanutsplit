/**
 * Register (POST) or drop (DELETE) one device's push channel for one room.
 *
 * Unlike every other write in Split, this one is NOT satisfied by holding the
 * room link. Reading a room needs only the link; binding a persistent delivery
 * channel to it needs proof of membership, because a bare link-holder who never
 * joined should not be able to make somebody's phone buzz on a schedule they
 * chose. The proof is the member token the server minted at join time.
 */
import { prisma } from '@/server/db'
import { ApiError, readJson, respond } from '@/server/http'
import { isAllowedPushEndpoint } from '@/server/pushHosts'
import { assertProvenMember, loadRoom } from '@/server/roomState'
import { assertWritable } from '@/server/rooms'
import { enforceRateLimit, WRITE_LIMIT } from '@/server/rateLimit'
import { pushSubscribeSchema, pushUnsubscribeSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

/** A trip is a dozen people with a phone and maybe a laptop each. Well past
 *  that, and it is a script rather than a room. */
const MAX_SUBSCRIPTIONS_PER_ROOM = 30

export const POST = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'push-subscribe')
        const { slug } = await ctx.params
        const body = pushSubscribeSchema.parse(await readJson(request))
        const room = await loadRoom(slug)
        assertWritable(room)
        assertProvenMember(room, body.memberId, body.memberToken)

        if (!isAllowedPushEndpoint(body.endpoint)) {
            throw new ApiError(400, 'UNSUPPORTED_PUSH_HOST', 'that is not a push service we can deliver to')
        }

        await prisma.$transaction(async (tx) => {
            // Count and insert are one room-scoped critical section. Without it,
            // several new devices can all observe 29 rows and push the room past
            // its hard ceiling.
            await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${room.id}, 0))`

            const existing = await tx.pushSubscription.findUnique({
                where: { endpoint_roomId: { endpoint: body.endpoint, roomId: room.id } },
                select: { id: true },
            })
            // The cap only applies to a NEW channel — a device re-subscribing
            // (the browser rotates its keys whenever it likes) must never be
            // locked out of a room that is already at the ceiling.
            if (!existing) {
                const count = await tx.pushSubscription.count({ where: { roomId: room.id } })
                if (count >= MAX_SUBSCRIPTIONS_PER_ROOM) {
                    throw new ApiError(429, 'PUSH_SUBSCRIPTION_LIMIT', 'this room has too many devices subscribed')
                }
            }

            await tx.pushSubscription.upsert({
                where: { endpoint_roomId: { endpoint: body.endpoint, roomId: room.id } },
                create: {
                    roomId: room.id,
                    memberId: body.memberId,
                    endpoint: body.endpoint,
                    p256dh: body.keys.p256dh,
                    auth: body.keys.auth,
                    userAgent: body.userAgent ?? null,
                },
                update: {
                    // memberId too: one phone can be passed to whoever is paying,
                    // and the channel should follow whoever it last proved it was.
                    memberId: body.memberId,
                    p256dh: body.keys.p256dh,
                    auth: body.keys.auth,
                    userAgent: body.userAgent ?? null,
                    lastSeenAt: new Date(),
                },
            })
        })

        return { subscribed: true }
    }, 201)

export const DELETE = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'push-subscribe')
        const { slug } = await ctx.params
        const body = pushUnsubscribeSchema.parse(await readJson(request))
        const room = await loadRoom(slug)
        assertProvenMember(room, body.memberId, body.memberToken)

        await prisma.pushSubscription.deleteMany({ where: { roomId: room.id, endpoint: body.endpoint } })
        return { subscribed: false }
    })
