/**
 * The request shapes and the credentials gate, without a database. The route
 * handler tests in `server/test/push.test.ts` cover the same paths end to end.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/server/http'
import { assertNativePushAvailable, fcmCredentials } from '@/server/push-native/config'
import { pushStatusSchema, pushSubscribeSchema, pushUnsubscribeSchema } from '@/server/validation'

const member = { memberId: 'member-1', memberToken: 'token-1' }
const APNS_TOKEN = 'a1b2c3d4'.repeat(8)
const FCM_TOKEN = 'dGVzdA:APA91bH-xyz_123'
const WEB = 'https://fcm.googleapis.com/fcm/send/abc'
const KEYS = { p256dh: 'BPk3p256dhKeyMaterial', auth: 'authKeyMaterial' }

describe('push subscribe body', () => {
    it('keeps a web body a web channel with its keys', () => {
        expect(pushSubscribeSchema.parse({ endpoint: WEB, keys: KEYS, ...member })).toMatchObject({
            transport: 'webpush',
            endpoint: WEB,
            keys: KEYS,
        })
    })

    it('still rejects a web body without keys', () => {
        expect(pushSubscribeSchema.safeParse({ endpoint: WEB, ...member }).success).toBe(false)
    })

    it.each([
        ['apns', APNS_TOKEN],
        ['apns-sandbox', APNS_TOKEN],
        ['fcm', FCM_TOKEN],
    ])('stores a %s token as a prefixed endpoint without keys', (transport, token) => {
        expect(pushSubscribeSchema.parse({ transport, token, ...member })).toEqual({
            transport,
            endpoint: `${transport}:${token}`,
            keys: null,
            ...member,
        })
    })

    it.each([
        ['an unknown transport', { transport: 'webpush', token: APNS_TOKEN }],
        ['a path in an APNs token', { transport: 'apns', token: 'abcd/../x' }],
        ['a non-hex APNs token', { transport: 'apns', token: FCM_TOKEN }],
        ['a query in an FCM token', { transport: 'fcm', token: 'abc?x=1' }],
        ['an empty token', { transport: 'fcm', token: '' }],
    ])('rejects %s', (_label, body) => {
        expect(pushSubscribeSchema.safeParse({ ...member, ...body }).success).toBe(false)
    })

    it('rejects a native body without the member token', () => {
        expect(
            pushSubscribeSchema.safeParse({ transport: 'fcm', token: FCM_TOKEN, memberId: 'member-1' }).success
        ).toBe(false)
    })
})

describe('push unsubscribe and status bodies', () => {
    it.each([
        ['unsubscribe', pushUnsubscribeSchema],
        ['status', pushStatusSchema],
    ])('%s accepts a web endpoint or a native token', (_label, schema) => {
        expect(schema.parse({ endpoint: WEB, ...member })).toEqual({ transport: 'webpush', endpoint: WEB, ...member })
        expect(schema.parse({ transport: 'fcm', token: FCM_TOKEN, ...member })).toEqual({
            transport: 'fcm',
            endpoint: `fcm:${FCM_TOKEN}`,
            ...member,
        })
        expect(schema.safeParse({ ...member }).success).toBe(false)
    })
})

describe('native push credentials gate', () => {
    const names = [
        'SPLIT_APNS_KEY_P8',
        'SPLIT_APNS_KEY_ID',
        'SPLIT_APNS_TEAM_ID',
        'SPLIT_APNS_BUNDLE_ID',
        'SPLIT_FCM_SERVICE_ACCOUNT_JSON',
    ] as const
    const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]))

    afterEach(() => {
        for (const name of names) {
            if (saved[name] === undefined) delete process.env[name]
            else process.env[name] = saved[name]
        }
    })

    const codeOf = (transport: Parameters<typeof assertNativePushAvailable>[0]) => {
        try {
            assertNativePushAvailable(transport)
            return 'ok'
        } catch (err) {
            return err instanceof ApiError ? `${err.status} ${err.code}` : 'other'
        }
    }

    it('answers 503 NATIVE_PUSH_UNAVAILABLE for a native transport without credentials, never for web', () => {
        for (const name of names) delete process.env[name]
        expect(codeOf('apns')).toBe('503 NATIVE_PUSH_UNAVAILABLE')
        expect(codeOf('apns-sandbox')).toBe('503 NATIVE_PUSH_UNAVAILABLE')
        expect(codeOf('fcm')).toBe('503 NATIVE_PUSH_UNAVAILABLE')
        expect(codeOf('webpush')).toBe('ok')
    })

    it('opens each transport only with its own complete credentials', () => {
        for (const name of names) delete process.env[name]
        process.env.SPLIT_APNS_KEY_P8 = 'key'
        process.env.SPLIT_APNS_KEY_ID = 'id'
        process.env.SPLIT_APNS_TEAM_ID = 'team'
        expect(codeOf('apns')).toBe('503 NATIVE_PUSH_UNAVAILABLE')
        process.env.SPLIT_APNS_BUNDLE_ID = 'com.peanutsplit.app'
        expect(codeOf('apns')).toBe('ok')
        expect(codeOf('apns-sandbox')).toBe('ok')
        expect(codeOf('fcm')).toBe('503 NATIVE_PUSH_UNAVAILABLE')

        process.env.SPLIT_FCM_SERVICE_ACCOUNT_JSON = '{not json'
        expect(codeOf('fcm')).toBe('503 NATIVE_PUSH_UNAVAILABLE')
        process.env.SPLIT_FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
            project_id: 'split-test',
            client_email: 'push@split-test.iam.gserviceaccount.com',
            // Any escaped multi-line string proves the unescape; a PEM-shaped literal trips the secret hook.
            private_key: 'line-one\\nline-two\\n',
        })
        expect(codeOf('fcm')).toBe('ok')
        expect(fcmCredentials()?.privateKey).toBe('line-one\nline-two\n')
    })
})
