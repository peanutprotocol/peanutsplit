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
import { enforceRateLimit, meterRoomLookup, WRITE_LIMIT } from '@/server/rateLimit'
import { pushSubscribeSchema, pushUnsubscribeSchema } from '@/server/validation'
import { actorForMember, appendRoomAuditEvent, lockRoomWrite } from '@/server/history'

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
        // A guessed slug 404s here and a real slug with a bad token 403s, so the
        // miss goes on the shared budget — same as the DELETE below and the
        // status route beside it. All three paths meter it the same way.
        const room = await meterRoomLookup(request, () => loadRoom(slug))
        assertWritable(room)
        assertProvenMember(room, body.memberId, body.memberToken)

        if (!isAllowedPushEndpoint(body.endpoint)) {
            throw new ApiError(400, 'UNSUPPORTED_PUSH_HOST', 'that is not a push service we can deliver to')
        }

        await prisma.$transaction(async (tx) => {
            // Count and insert are one room-scoped critical section. Without it,
            // several new devices can all observe 29 rows and push the room past
            // its hard ceiling.
            await lockRoomWrite(tx, room.id)

            const existing = await tx.pushSubscription.findUnique({
                where: { endpoint_roomId: { endpoint: body.endpoint, roomId: room.id } },
                select: { id: true, memberId: true },
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
            if (!existing || existing.memberId !== body.memberId) {
                const member = room.members.find(
                    (candidate) => candidate.id === body.memberId
                ) as (typeof room.members)[number]
                await appendRoomAuditEvent({
                    tx,
                    request,
                    roomId: room.id,
                    actor: actorForMember(member),
                    event: {
                        kind: 'push_subscribed',
                        subjectType: 'push_subscription',
                        subjectId: body.memberId,
                        ...(existing ? { before: { memberId: existing.memberId } } : {}),
                        after: { memberId: body.memberId },
                    },
                })
            }
        })

        return { subscribed: true }
    }, 201)

export const DELETE = (request: Request, ctx: Ctx) =>
    respond(async () => {
        enforceRateLimit(request, WRITE_LIMIT, 'push-subscribe')
        const { slug } = await ctx.params
        const body = pushUnsubscribeSchema.parse(await readJson(request))
        // Same 404-versus-403 oracle as the status route: metered on the shared
        // miss budget rather than this route's own write bucket.
        const room = await meterRoomLookup(request, () => loadRoom(slug))
        assertProvenMember(room, body.memberId, body.memberToken)

        // One endpoint can hold a channel in several rooms, so the caller has to
        // be told whether the browser subscription is still needed. Counting in
        // the same transaction as the delete is what makes the answer safe to
        // act on: a concurrent subscribe in another room either lands before the
        // count (still used) or after (and re-creates its own channel).
        const endpointStillUsed = await prisma.$transaction(async (tx) => {
            await lockRoomWrite(tx, room.id)
            const existing = await tx.pushSubscription.findUnique({
                where: { endpoint_roomId: { endpoint: body.endpoint, roomId: room.id } },
                select: { id: true, memberId: true },
            })
            const removed = await tx.pushSubscription.deleteMany({
                where: { roomId: room.id, endpoint: body.endpoint },
            })
            if (removed.count > 0 && existing) {
                const member = room.members.find(
                    (candidate) => candidate.id === body.memberId
                ) as (typeof room.members)[number]
                await appendRoomAuditEvent({
                    tx,
                    request,
                    roomId: room.id,
                    actor: actorForMember(member),
                    event: {
                        kind: 'push_unsubscribed',
                        subjectType: 'push_subscription',
                        subjectId: existing.memberId,
                        before: { memberId: existing.memberId },
                    },
                })
            }
            return (await tx.pushSubscription.count({ where: { endpoint: body.endpoint } })) > 0
        })

        return { subscribed: false, endpointStillUsed }
    })
