/**
 * Apple Push Notification service sender: token-based auth over HTTP/2.
 *
 * No SDK: the provider token is an ES256 JWT signed with `node:crypto`, and the
 * request is one `http2` POST per device. A row's transport picks the host:
 * `apns` goes to production, `apns-sandbox` to Apple's development service
 * (debug and TestFlight-less device builds).
 */
import { sign } from 'node:crypto'
import http2 from 'node:http2'
import tls from 'node:tls'
import type { ApnsCredentials } from '@/server/push-native/config'
import {
    apnsPayload,
    NATIVE_TTL_SECONDS,
    type NativeDelivery,
    type NativeNotification,
} from '@/server/push-native/payload'
import { openTunnel } from '@/server/push-native/tunnel'

const HOSTS = { production: 'api.push.apple.com', sandbox: 'api.sandbox.push.apple.com' } as const
const REQUEST_TIMEOUT_MS = 10_000
/** Apple rejects a provider token older than an hour and throttles one renewed
 *  more often than every 20 minutes. */
const TOKEN_LIFETIME_MS = 50 * 60_000

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url')

/** The provider JWT: `{ alg: ES256, kid }` over `{ iss: teamId, iat }`. */
export function signApnsToken(credentials: Pick<ApnsCredentials, 'keyP8' | 'keyId' | 'teamId'>, nowMs: number): string {
    const header = base64url(JSON.stringify({ alg: 'ES256', kid: credentials.keyId }))
    const claims = base64url(JSON.stringify({ iss: credentials.teamId, iat: Math.floor(nowMs / 1000) }))
    const input = `${header}.${claims}`
    // JOSE wants the raw r||s signature, not Node's default DER encoding.
    const signature = sign('sha256', Buffer.from(input), { key: credentials.keyP8, dsaEncoding: 'ieee-p1363' })
    return `${input}.${base64url(signature)}`
}

let cachedToken: { value: string; keyId: string; issuedAt: number } | null = null

function providerToken(credentials: ApnsCredentials): string {
    const now = Date.now()
    if (!cachedToken || cachedToken.keyId !== credentials.keyId || now - cachedToken.issuedAt > TOKEN_LIFETIME_MS) {
        cachedToken = { value: signApnsToken(credentials, now), keyId: credentials.keyId, issuedAt: now }
    }
    return cachedToken.value
}

/** Test seam: drops the cached provider token. */
export function resetApnsToken(): void {
    cachedToken = null
}

/**
 * Apple says the token is gone: 410 (Unregistered, the app was removed) or 400
 * BadDeviceToken (a token from the other environment, or garbage). Retrying it
 * on every future event would only add noise, so the row is deleted.
 */
export function isDeadApnsToken(status: number, reason: string | undefined): boolean {
    return status === 410 || (status === 400 && reason === 'BadDeviceToken')
}

async function openSession(host: string): Promise<http2.ClientHttp2Session> {
    const authority = `https://${host}:443`
    const proxyUrl = process.env.SPLIT_PUSH_PROXY_URL
    if (!proxyUrl) return http2.connect(authority)
    const socket = await openTunnel(proxyUrl, host, 443)
    const secure = tls.connect({ socket, servername: host, ALPNProtocols: ['h2'] })
    return http2.connect(authority, { createConnection: () => secure })
}

function post(
    session: http2.ClientHttp2Session,
    headers: http2.OutgoingHttpHeaders,
    body: string
): Promise<{ status: number; reason?: string }> {
    return new Promise((resolve, reject) => {
        const request = session.request(headers)
        let status = 0
        let text = ''
        request.setEncoding('utf8')
        request.setTimeout(REQUEST_TIMEOUT_MS, () => request.close(http2.constants.NGHTTP2_CANCEL))
        request.on('response', (response) => {
            status = Number(response[':status'])
        })
        request.on('data', (chunk: string) => {
            text += chunk
        })
        request.on('end', () => {
            let reason: string | undefined
            try {
                reason = text ? (JSON.parse(text) as { reason?: string }).reason : undefined
            } catch {
                reason = undefined
            }
            resolve({ status, reason })
        })
        request.on('error', reject)
        // A cancelled (timed-out) stream closes without 'end'; status 0 then
        // reads as a failed send that keeps its row.
        request.on('close', () => resolve({ status, reason: undefined }))
        request.end(body)
    })
}

/**
 * Sends one notification to every token, one HTTP/2 session per Apple host for
 * the whole batch. Results come back in the order of `targets`. A connection
 * failure fails the batch's sends but never marks a token dead.
 */
export async function sendApns(
    credentials: ApnsCredentials,
    targets: readonly { token: string; sandbox: boolean }[],
    notification: NativeNotification
): Promise<NativeDelivery[]> {
    const body = JSON.stringify(apnsPayload(notification))
    const results: NativeDelivery[] = targets.map(() => ({ ok: false, dead: false }))
    for (const sandbox of [false, true]) {
        const indexes = targets.flatMap((target, index) => (target.sandbox === sandbox ? [index] : []))
        if (indexes.length === 0) continue
        let session: http2.ClientHttp2Session | null = null
        try {
            session = await openSession(sandbox ? HOSTS.sandbox : HOSTS.production)
            // An idle session error must not crash the process; requests on it
            // fail through their own error events.
            session.on('error', () => {})
            const open = session
            await Promise.all(
                indexes.map(async (index) => {
                    try {
                        const { status, reason } = await post(
                            open,
                            {
                                ':method': 'POST',
                                ':path': `/3/device/${targets[index].token}`,
                                authorization: `bearer ${providerToken(credentials)}`,
                                'apns-topic': credentials.bundleId,
                                'apns-push-type': 'alert',
                                'apns-priority': '10',
                                'apns-expiration': String(Math.floor(Date.now() / 1000) + NATIVE_TTL_SECONDS),
                                // Same coalescing as the Web Push tag: a newer
                                // notification for the room replaces the older one.
                                'apns-collapse-id': notification.room,
                                'content-type': 'application/json',
                            },
                            body
                        )
                        results[index] = {
                            ok: status === 200,
                            dead: isDeadApnsToken(status, reason),
                            statusCode: status,
                        }
                        if (status !== 200) console.warn('[split] apns delivery failed', { status, reason })
                    } catch {
                        console.warn('[split] apns delivery failed', { status: 'request-error' })
                    }
                })
            )
        } catch {
            console.warn('[split] apns connection failed')
        } finally {
            session?.close()
        }
    }
    return results
}
