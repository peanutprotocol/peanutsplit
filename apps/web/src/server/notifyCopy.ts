/**
 * Every string that can end up on somebody's lock screen, in one module.
 *
 * English only today. When Split gets a second locale, next-intl wires in here
 * and nowhere else — that is the whole reason the copy is not inlined at the
 * three call sites that produce it.
 *
 * Amounts and member names ARE allowed in a payload: it is encrypted end-to-end
 * to a device that already holds the room link and can read all of it in the
 * app anyway. The room SLUG is the thing to be careful with — it is the room's
 * access control, so it appears only in the click-through `url`, never in a log
 * line or an analytics property.
 */
import { formatMoney } from '@/lib/money'
import { isEmojiEmblem } from '@/lib/room-emblem'

export type NotificationTemplate = 'expense_added' | 'settlement_recorded' | 'all_settled'

export interface PushPayload {
    title: string
    body: string
    /** Same-origin path the notification opens. */
    url: string
    template: NotificationTemplate
    /** Post-delivery coalescing key — see `roomTag`. */
    tag: string
    /** Ledger row id, echoed back by the service worker's beacons. */
    sendId: string
}

interface RoomRef {
    slug: string
    name: string
    emoji: string | null
    currency: string
}

/**
 * `🏔️ Ski trip`, or just `Ski trip`.
 *
 * Guarded by `isEmojiEmblem` because the column now also holds doodle names, and a push titled
 * "mountain Ski trip" is the exact failure this check exists to stop. A drawn emblem simply does
 * not appear in the title — a notification is text, and there is nowhere to render a path in it.
 */
const titleOf = (room: RoomRef) => (isEmojiEmblem(room.emoji) ? `${room.emoji} ${room.name}` : room.name)

const roomUrl = (room: RoomRef) => `/r/${room.slug}`

/**
 * One tag per room, deliberately. A phone that gets three room notifications
 * while it is in a pocket shows the latest one, not a stack of three — the
 * server-side throttles cap how many we send, and this caps what survives on
 * the device.
 */
const roomTag = (roomId: string) => `room:${roomId}`

/** Falls back to "Someone" — attribution comes from an X-Member-Token header
 *  that a client is free not to send. */
const nameOf = (name: string | null | undefined) => name ?? 'Someone'

export function expenseAddedPayload(input: {
    room: RoomRef
    roomId: string
    sendId: string
    actorName: string | null
    description: string
    amountMinor: string
    currency: string
}): PushPayload {
    return {
        title: titleOf(input.room),
        body: `${nameOf(input.actorName)} added ${input.description} — ${formatMoney(input.amountMinor, input.currency)}`,
        url: roomUrl(input.room),
        template: 'expense_added',
        tag: roomTag(input.roomId),
        sendId: input.sendId,
    }
}

export function settlementRecordedPayload(input: {
    room: RoomRef
    roomId: string
    sendId: string
    fromName: string | null
    toName: string | null
    amountMinor: string
}): PushPayload {
    return {
        title: titleOf(input.room),
        body: `${nameOf(input.fromName)} paid ${nameOf(input.toName)} ${formatMoney(input.amountMinor, input.room.currency)}`,
        url: roomUrl(input.room),
        template: 'settlement_recorded',
        tag: roomTag(input.roomId),
        sendId: input.sendId,
    }
}

export function allSettledPayload(input: { room: RoomRef; roomId: string; sendId: string }): PushPayload {
    return {
        title: titleOf(input.room),
        body: 'Everyone is square — nothing left to settle.',
        url: roomUrl(input.room),
        template: 'all_settled',
        tag: roomTag(input.roomId),
        sendId: input.sendId,
    }
}
