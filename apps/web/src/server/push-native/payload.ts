/**
 * App notification bodies for APNs and FCM. Pure, so the "no slug" rule is a
 * unit test rather than a promise.
 *
 * Apple and Google can read these payloads (Web Push is end-to-end encrypted;
 * these are not), and the slug is the room's credential. So the only room id
 * here is the `analyticsKey`, a one-way digest the app maps back to a room it
 * already knows, and any title or body that would contain the slug is replaced
 * with generic copy.
 */
import { NATIVE_GENERIC_BODY, NATIVE_GENERIC_TITLE, NATIVE_PUSH_BODY, type PushPayload } from '@/server/notifyCopy'

/** Web Push drops a message it could not deliver within a day; so do these. */
export const NATIVE_TTL_SECONDS = 86_400

/** What an app notification may carry. No slug, no URL. */
export interface NativeNotification {
    title: string
    body: string
    /** The room's `analyticsKey`. */
    room: string
    /** Ledger row id, echoed back by the app's opened beacon. */
    sendId: string
}

/** One device's outcome. `dead` means the service says the token is gone for
 *  good and the row should be deleted. */
export interface NativeDelivery {
    ok: boolean
    dead: boolean
    statusCode?: number
}

const mentions = (text: string, slug: string) => text.toLowerCase().includes(slug.toLowerCase())

export function toNativeNotification(
    payload: PushPayload,
    room: { slug: string; analyticsKey: string }
): NativeNotification {
    const body = NATIVE_PUSH_BODY ?? payload.body
    return {
        title: mentions(payload.title, room.slug) ? NATIVE_GENERIC_TITLE : payload.title,
        body: mentions(body, room.slug) ? NATIVE_GENERIC_BODY : body,
        room: room.analyticsKey,
        sendId: payload.sendId,
    }
}

/** The JSON body of one APNs request. `thread-id` groups a room's notifications. */
export function apnsPayload(n: NativeNotification) {
    return {
        aps: { alert: { title: n.title, body: n.body }, 'thread-id': n.room },
        room: n.room,
        sendId: n.sendId,
    }
}

/** The JSON body of one FCM HTTP v1 `messages:send` request. */
export function fcmMessage(token: string, n: NativeNotification) {
    return {
        message: {
            token,
            notification: { title: n.title, body: n.body },
            android: {
                ttl: `${NATIVE_TTL_SECONDS}s`,
                // One tag per room: a newer notification replaces the older one
                // on the device, as the Web Push tag does.
                notification: { tag: n.room, icon: 'ic_stat_split' },
            },
            data: { room: n.room, sendId: n.sendId },
        },
    }
}
