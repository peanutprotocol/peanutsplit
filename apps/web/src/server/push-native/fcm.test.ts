import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync, verify } from 'node:crypto'
import { isDeadFcmToken, resetFcmToken, sendFcm, signFcmAssertion } from '@/server/push-native/fcm'
import type { NativeNotification } from '@/server/push-native/payload'

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const credentials = {
    projectId: 'split-test',
    clientEmail: 'push@split-test.iam.gserviceaccount.com',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
}

describe('FCM OAuth assertion', () => {
    it('is an RS256 JWT for the messaging scope that verifies against the service account key', () => {
        const now = Date.UTC(2026, 10, 14, 2, 0, 0)
        const [header, claims, signature] = signFcmAssertion(credentials, now).split('.')

        expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' })
        expect(decode(claims)).toEqual({
            iss: credentials.clientEmail,
            scope: 'https://www.googleapis.com/auth/firebase.messaging',
            aud: 'https://oauth2.googleapis.com/token',
            iat: now / 1000,
            exp: now / 1000 + 3600,
        })
        expect(
            verify('sha256', Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, 'base64url'))
        ).toBe(true)
    })
})

describe('FCM dead-token classification', () => {
    const unregistered = {
        error: {
            status: 'NOT_FOUND',
            details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }],
        },
    }
    const invalidArgument = {
        error: { status: 'INVALID_ARGUMENT', details: [{ errorCode: 'INVALID_ARGUMENT' }] },
    }

    it.each([
        [404, unregistered, true],
        [404, null, true],
        [400, { error: { details: [{ errorCode: 'UNREGISTERED' }] } }, true],
        [400, invalidArgument, false],
        [401, null, false],
        [429, { error: { details: [{ errorCode: 'QUOTA_EXCEEDED' }] } }, false],
        [503, 'not json', false],
    ])('status %i → dead %s', (status, body, dead) => {
        expect(isDeadFcmToken(status, body)).toBe(dead)
    })
})

describe('sendFcm', () => {
    const notification: NativeNotification = {
        title: 'Ski Trip',
        body: 'Ana added Lift passes — €120.00',
        room: '0123456789abcdef0123456789abcdef',
        sendId: '00000000-0000-4000-8000-000000000001',
    }
    const fetchMock = vi.fn<typeof fetch>()

    beforeEach(() => {
        resetFcmToken()
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        // No proxy: egressFetch uses the global fetch, which is the stub.
        delete process.env.SPLIT_PUSH_PROXY_URL
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('gets one access token, sends to each device and marks only the unregistered one dead', async () => {
        fetchMock.mockImplementation(async (input, init) => {
            const url = String(input)
            if (url === 'https://oauth2.googleapis.com/token') {
                return Response.json({ access_token: 'access-1', expires_in: 3600 })
            }
            const sent = JSON.parse(String(init?.body)) as { message: { token: string } }
            if (sent.message.token === 'gone-token')
                return Response.json({ error: { status: 'NOT_FOUND' } }, { status: 404 })
            if (sent.message.token === 'busy-token') return Response.json({ error: {} }, { status: 503 })
            return Response.json({ name: 'projects/split-test/messages/1' })
        })

        const results = await sendFcm(credentials, ['live-token', 'gone-token', 'busy-token'], notification)

        expect(results).toEqual([
            { ok: true, dead: false, statusCode: 200 },
            { ok: false, dead: true, statusCode: 404 },
            { ok: false, dead: false, statusCode: 503 },
        ])
        const urls = fetchMock.mock.calls.map(([input]) => String(input))
        expect(urls.filter((url) => url.endsWith('/token'))).toHaveLength(1)
        expect(
            urls.filter((url) => url === 'https://fcm.googleapis.com/v1/projects/split-test/messages:send')
        ).toHaveLength(3)

        // The cached token is reused for the next event.
        await sendFcm(credentials, ['live-token'], notification)
        expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/token'))).toHaveLength(1)
    })

    it('fails every send without marking a token dead when the token call fails', async () => {
        fetchMock.mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 }))

        expect(await sendFcm(credentials, ['a', 'b'], notification)).toEqual([
            { ok: false, dead: false },
            { ok: false, dead: false },
        ])
    })
})
