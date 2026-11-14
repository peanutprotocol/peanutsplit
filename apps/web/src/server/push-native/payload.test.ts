import { describe, expect, it } from 'vitest'
import { allSettledPayload, expenseAddedPayload, NATIVE_GENERIC_BODY, NATIVE_GENERIC_TITLE } from '@/server/notifyCopy'
import { apnsPayload, fcmMessage, toNativeNotification } from '@/server/push-native/payload'

const SLUG = 'ski-trip-kunc-syrup-drum'
const ANALYTICS_KEY = '0123456789abcdef0123456789abcdef'
const SEND_ID = '00000000-0000-4000-8000-000000000001'

const room = (name: string) => ({ slug: SLUG, name, emoji: null, currency: 'EUR' })

const serialized = (name: string, description = 'Lift passes') => {
    const web = expenseAddedPayload({
        room: room(name),
        roomId: 'room-uuid',
        sendId: SEND_ID,
        actorName: 'Ana',
        description,
        amountMinor: '12000',
        currency: 'EUR',
    })
    const notification = toNativeNotification(web, { slug: SLUG, analyticsKey: ANALYTICS_KEY })
    return {
        notification,
        apns: JSON.stringify(apnsPayload(notification)),
        fcm: JSON.stringify(fcmMessage('device-token', notification)),
    }
}

describe('app notification payloads', () => {
    it('carry the web title and body, the analytics key and the send id', () => {
        const { notification, apns, fcm } = serialized('Ski Trip')
        expect(notification).toEqual({
            title: 'Ski Trip',
            body: 'Ana added Lift passes — €120.00',
            room: ANALYTICS_KEY,
            sendId: SEND_ID,
        })
        expect(JSON.parse(apns)).toEqual({
            aps: { alert: { title: 'Ski Trip', body: 'Ana added Lift passes — €120.00' }, 'thread-id': ANALYTICS_KEY },
            room: ANALYTICS_KEY,
            sendId: SEND_ID,
        })
        expect(JSON.parse(fcm)).toEqual({
            message: {
                token: 'device-token',
                notification: { title: 'Ski Trip', body: 'Ana added Lift passes — €120.00' },
                android: { ttl: '86400s', notification: { tag: ANALYTICS_KEY, icon: 'ic_stat_split' } },
                data: { room: ANALYTICS_KEY, sendId: SEND_ID },
            },
        })
    })

    it('never contain the slug, while the web payload does', () => {
        const web = allSettledPayload({ room: room('Ski Trip'), roomId: 'room-uuid', sendId: SEND_ID })
        expect(JSON.stringify(web)).toContain(SLUG)

        const { apns, fcm } = serialized('Ski Trip')
        expect(apns).not.toContain(SLUG)
        expect(fcm).not.toContain(SLUG)
        expect(apns).not.toContain('/r/')
        expect(fcm).not.toContain('/r/')
    })

    it('replace a title that is the slug, as when a room is named after its own link', () => {
        const { notification, apns, fcm } = serialized(SLUG)
        expect(notification.title).toBe(NATIVE_GENERIC_TITLE)
        expect(apns).not.toContain(SLUG)
        expect(fcm).not.toContain(SLUG)
    })

    it('replace a body that mentions the slug, in any letter case', () => {
        const { notification, apns, fcm } = serialized('Ski Trip', `Paid via ${SLUG.toUpperCase()}`)
        expect(notification.body).toBe(NATIVE_GENERIC_BODY)
        expect(apns.toLowerCase()).not.toContain(SLUG)
        expect(fcm.toLowerCase()).not.toContain(SLUG)
    })
})
