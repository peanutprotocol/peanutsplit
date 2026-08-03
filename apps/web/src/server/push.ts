/**
 * Web-push fan-out for room events.
 *
 * The product rule is one line: you get a notification when SOMEBODY ELSE in a
 * room you opted into writes something. Everything below exists to make that
 * true without ever becoming a spam channel — event-driven only, no cron, no
 * digest, and three structural anti-spam gates:
 *
 *   1. the actor never receives their own write,
 *   2. a `NotificationSend` row is a claim, and its unique `dedupeKey` makes a
 *      retry (or a second container racing the same write) a no-op,
 *   3. `expense_added` is additionally capped per room per UTC day, because
 *      entering a trip's worth of receipts in one sitting is one session, not
 *      twenty events.
 *
 * With no VAPID keys configured the whole module is inert — it warns once and
 * every send returns `disabled`. That is the local-dev and self-hoster default.
 */
import { Prisma, type PushSubscription as PushSubscriptionRow } from '@prisma/client'
import { HttpsProxyAgent } from 'https-proxy-agent'
import webpush, { type RequestOptions, WebPushError } from 'web-push'
import { prisma } from '@/server/db'
import type { PushRoomWriteEvent } from '@/server/history'
import {
    allSettledPayload,
    expenseAddedPayload,
    settlementRecordedPayload,
    type NotificationTemplate,
    type PushPayload,
} from '@/server/notifyCopy'
import type { RoomWithRelations } from '@/server/roomState'
import type { RoomState } from '@/lib/api-types'

/** A 20-expense entry session must not fire 20 pushes. Post-delivery coalescing
 *  (one tag per room) would collapse them on the device, but they would still
 *  have buzzed the phone twenty times on the way there. */
const EXPENSE_ADDED_DAILY_CAP = 3

/** Push services drop anything they could not deliver within the TTL; a day is
 *  as long as "someone added a receipt" stays worth waking a screen for. */
const TTL_SECONDS = 86_400

export type SendOutcome =
    | { status: 'disabled' }
    | { status: 'skipped'; reason: 'no-targets' | 'daily-cap' | 'already-sent' }
    | { status: 'sent'; delivered: number; pruned: number }
    | { status: 'failed'; delivered: 0; pruned: number }

let vapidState: boolean | null = null

/**
 * NEVER ROTATE THE VAPID PAIR IN PLACE. Every stored subscription is bound to
 * the public key it was created against: swap the pair and every device on the
 * old one stops receiving, silently, with no error anywhere and no way back
 * except each user re-visiting and re-subscribing. A genuine rotation needs a
 * dual-key window — keep signing with the old pair while new subscriptions are
 * minted against the new one, and only retire the old pair once no rows created
 * under it remain.
 */
function vapidReady(): boolean {
    if (vapidState !== null) return vapidState
    const publicKey = process.env.SPLIT_VAPID_PUBLIC_KEY
    const privateKey = process.env.SPLIT_VAPID_PRIVATE_KEY
    const subject = process.env.SPLIT_VAPID_SUBJECT
    if (!publicKey || !privateKey || !subject) {
        // Once. This is the normal state in dev and for anyone self-hosting, so
        // it is a one-line fact on boot, not a warning per write.
        console.warn('[split] push disabled: VAPID keys unset')
        vapidState = false
        return false
    }
    webpush.setVapidDetails(subject, publicKey, privateKey)
    vapidState = true
    return true
}

/** Test seam — the module memoises the VAPID check, and a test that changes the
 *  env needs that cache dropped. */
export function resetPushConfig(): void {
    vapidState = null
}

/**
 * The production container has no egress: reaching a push service means going
 * through a proxy pinned to it. Unset (dev, and any deploy with plain outbound
 * internet) means a direct request.
 */
function requestOptions(): RequestOptions {
    const proxyUrl = process.env.SPLIT_PUSH_PROXY_URL
    return {
        TTL: TTL_SECONDS,
        urgency: 'normal',
        ...(proxyUrl ? { agent: new HttpsProxyAgent(proxyUrl) } : {}),
    }
}

/** UTC, so the throttle window is the same one everywhere and does not shift
 *  under a room whose members are in four timezones. */
export const utcDayKey = (at: Date = new Date()): string => at.toISOString().slice(0, 10)

/**
 * Take the dedupe slot by inserting the ledger row. Returns null when somebody
 * already holds it.
 *
 * ONLY P2002 means "already claimed". A blanket catch here would swallow a
 * connection error, report the event as already-sent, and blackhole the
 * notification with nothing anywhere recording that it never went out — so
 * everything else rethrows and surfaces as a normal failure.
 */
export async function claimSend(
    input: {
        roomId: string
        template: NotificationTemplate
        dayKey: string
        dedupeKey: string
    },
    db: Pick<Prisma.TransactionClient, 'notificationSend'> = prisma
): Promise<{ id: string } | null> {
    try {
        return await db.notificationSend.create({
            data: { ...input, status: 'claimed' },
            select: { id: true },
        })
    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null
        throw err
    }
}

interface SendRoomEventInput {
    room: RoomWithRelations
    template: NotificationTemplate
    /** Whoever caused the event — excluded from delivery. Null when the writer
     *  sent no member token, in which case everyone subscribed gets it. */
    actorMemberId: string | null
    /** Per-event templates key their dedupe slot on this. Omit for daily ones. */
    eventId?: string
    buildPayload: (sendId: string) => PushPayload
}

export async function sendRoomEvent(input: SendRoomEventInput): Promise<SendOutcome> {
    if (!vapidReady()) return { status: 'disabled' }

    const { room, template, actorMemberId } = input
    const targets = await prisma.pushSubscription.findMany({
        where: {
            roomId: room.id,
            ...(actorMemberId ? { memberId: { not: actorMemberId } } : {}),
        },
    })
    // Checked BEFORE the claim on purpose. Claiming first would burn the slot —
    // permanently for a per-event template, for the rest of the day for a capped
    // one — on an event nobody could have received, so the first person to
    // subscribe would find the notification already "sent".
    if (targets.length === 0) return { status: 'skipped', reason: 'no-targets' }

    const dayKey = utcDayKey()
    const dedupeKey = `${room.id}:${template}:${input.eventId ?? dayKey}`
    const claim = await prisma.$transaction(async (tx) => {
        // The cap and claim must be one room-scoped decision. Parallel expenses
        // otherwise all see the same pre-cap count and each reserve a send.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${room.id}, 0))`

        if (template === 'expense_added') {
            const alreadyToday = await tx.notificationSend.count({
                where: { roomId: room.id, template, dayKey },
            })
            if (alreadyToday >= EXPENSE_ADDED_DAILY_CAP) return 'daily-cap' as const
        }

        // Avoid raising a uniqueness error inside the interactive transaction:
        // PostgreSQL keeps the transaction aborted even when Prisma's P2002 is
        // caught. The advisory lock makes this lookup authoritative for every
        // send-pipeline caller in the room; the unique index remains the final
        // guard for direct claim callers.
        const existing = await tx.notificationSend.findUnique({ where: { dedupeKey }, select: { id: true } })
        if (existing) return null

        return claimSend({ roomId: room.id, template, dayKey, dedupeKey }, tx)
    })
    if (claim === 'daily-cap') return { status: 'skipped', reason: 'daily-cap' }
    if (!claim) return { status: 'skipped', reason: 'already-sent' }

    const payload = JSON.stringify(input.buildPayload(claim.id))
    const options = requestOptions()
    const results = await Promise.all(targets.map((target) => deliver(target, payload, options)))

    const dead = results.filter((r) => r.dead).map((r) => r.id)
    // A 404/410 is the push service saying the browser threw this endpoint away.
    // Keeping it means retrying a corpse on every future event, forever.
    if (dead.length > 0) await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } })

    const delivered = results.filter((r) => r.ok).length
    const firstError = results.find((r) => !r.ok && r.statusCode !== undefined)?.statusCode
    await prisma.notificationSend.update({
        where: { id: claim.id },
        data: {
            status: delivered > 0 ? 'sent' : 'failed',
            errorCode: delivered > 0 ? null : (firstError?.toString() ?? 'no-delivery'),
        },
    })

    return delivered > 0
        ? { status: 'sent', delivered, pruned: dead.length }
        : { status: 'failed', delivered: 0, pruned: dead.length }
}

interface DeliveryResult {
    id: string
    ok: boolean
    dead: boolean
    statusCode?: number
}

async function deliver(target: PushSubscriptionRow, payload: string, options: RequestOptions): Promise<DeliveryResult> {
    try {
        await webpush.sendNotification(
            { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
            payload,
            options
        )
        return { id: target.id, ok: true, dead: false }
    } catch (err) {
        const statusCode = err instanceof WebPushError ? err.statusCode : undefined
        if (statusCode === 404 || statusCode === 410) return { id: target.id, ok: false, dead: true, statusCode }
        // No slug, no endpoint, no names — a warn line is not a place to put a
        // room credential.
        console.warn('[split] push delivery failed', { statusCode: statusCode ?? 'unknown' })
        return { id: target.id, ok: false, dead: false, statusCode }
    }
}

/** True once the room has spent money and nobody owes anybody. */
export function isAllSettled(state: RoomState): boolean {
    if (state.expenses.length === 0) return false
    return Object.values(state.balances).every((net) => BigInt(net) === 0n)
}

/**
 * The one call the route handlers make. Synchronous and void by construction:
 * the response value is already built by the time this runs, and a push service
 * timing out must never turn a saved expense into a 500 for the person who
 * saved it.
 */
export function notifyRoomWrite(input: {
    room: RoomWithRelations
    state: RoomState
    actorMemberId: string | null
    event: PushRoomWriteEvent
}): void {
    const { room, state, actorMemberId, event } = input
    const nameOf = (id: string | null | undefined) => room.members.find((m) => m.id === id)?.name ?? null
    const roomRef = { slug: room.slug, name: room.name, emoji: room.emoji, currency: room.currency }

    if (event.kind === 'expense_added') {
        const expense = room.expenses.find((e) => e.id === event.expenseId)
        if (expense) {
            fireAndForget(
                sendRoomEvent({
                    room,
                    template: 'expense_added',
                    actorMemberId,
                    eventId: expense.id,
                    buildPayload: (sendId) =>
                        expenseAddedPayload({
                            room: roomRef,
                            roomId: room.id,
                            sendId,
                            actorName: nameOf(expense.createdById),
                            description: expense.description,
                            amountMinor: expense.amountMinor.toString(),
                            currency: expense.currency,
                        }),
                })
            )
        }
    } else {
        const settlement = room.settlements.find((s) => s.id === event.settlementId)
        if (settlement) {
            fireAndForget(
                sendRoomEvent({
                    room,
                    template: 'settlement_recorded',
                    actorMemberId,
                    eventId: settlement.id,
                    buildPayload: (sendId) =>
                        settlementRecordedPayload({
                            room: roomRef,
                            roomId: room.id,
                            sendId,
                            fromName: nameOf(settlement.fromId),
                            toName: nameOf(settlement.toId),
                            amountMinor: settlement.amountMinor.toString(),
                        }),
                })
            )
        }
    }

    // "Transition" is derived, not tracked: the room is settled now, and the
    // per-room-per-day dedupe key is what keeps it from being announced again
    // every time somebody adds and clears another debt the same afternoon.
    if (isAllSettled(state)) {
        fireAndForget(
            sendRoomEvent({
                room,
                template: 'all_settled',
                actorMemberId,
                buildPayload: (sendId) => allSettledPayload({ room: roomRef, roomId: room.id, sendId }),
            })
        )
    }
}

function fireAndForget(send: Promise<SendOutcome>): void {
    void send.catch((err) => console.error('[split] push dispatch failed', err))
}
