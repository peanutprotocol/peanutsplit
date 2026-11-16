/**
 * Firebase Cloud Messaging sender (HTTP v1) for the Android app.
 *
 * No SDK: the service account signs an RS256 JWT with `node:crypto`, Google's
 * token endpoint swaps it for an hour-long access token, and each device gets
 * one `messages:send` POST. Both calls go through `egressFetch` with
 * `SPLIT_PUSH_PROXY_URL`, the same way out of the container as every other
 * runtime request.
 */
import { sign } from 'node:crypto'
import type { FcmCredentials } from '@/server/push-native/config'
import { fcmMessage, type NativeDelivery, type NativeNotification } from '@/server/push-native/payload'
import { egressFetch } from '@/server/egress'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const TOKEN_LIFETIME_S = 3600
/** Renew a minute early so a token never expires between check and send. */
const RENEW_MARGIN_MS = 60_000
const REQUEST_TIMEOUT_MS = 10_000

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url')

/** The OAuth assertion Google's token endpoint takes for a service account. */
export function signFcmAssertion(
    credentials: Pick<FcmCredentials, 'clientEmail' | 'privateKey'>,
    nowMs: number
): string {
    const iat = Math.floor(nowMs / 1000)
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claims = base64url(
        JSON.stringify({ iss: credentials.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + TOKEN_LIFETIME_S })
    )
    const input = `${header}.${claims}`
    return `${input}.${base64url(sign('sha256', Buffer.from(input), credentials.privateKey))}`
}

/**
 * FCM says the token is gone: the app was uninstalled or the token rotated
 * (`UNREGISTERED`, usually with 404). Anything else, including 400
 * INVALID_ARGUMENT, keeps the row: that code also covers a bad payload.
 */
export function isDeadFcmToken(status: number, body: unknown): boolean {
    if (status === 404) return true
    const details = (body as { error?: { details?: { errorCode?: unknown }[] } } | null)?.error?.details
    return Array.isArray(details) && details.some((detail) => detail?.errorCode === 'UNREGISTERED')
}

let cachedToken: { value: string; clientEmail: string; expiresAt: number } | null = null

/** Test seam: drops the cached access token. */
export function resetFcmToken(): void {
    cachedToken = null
}

async function accessToken(credentials: FcmCredentials, proxyUrl: string | undefined): Promise<string> {
    const now = Date.now()
    if (cachedToken && cachedToken.clientEmail === credentials.clientEmail && now < cachedToken.expiresAt) {
        return cachedToken.value
    }
    const response = await egressFetch(proxyUrl, TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: signFcmAssertion(credentials, now),
        }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`fcm token request failed: ${response.status}`)
    const json = (await response.json()) as { access_token?: unknown; expires_in?: unknown }
    if (typeof json.access_token !== 'string') throw new Error('fcm token response had no access_token')
    const lifetimeS = typeof json.expires_in === 'number' ? json.expires_in : TOKEN_LIFETIME_S
    cachedToken = {
        value: json.access_token,
        clientEmail: credentials.clientEmail,
        expiresAt: now + lifetimeS * 1000 - RENEW_MARGIN_MS,
    }
    return cachedToken.value
}

/** Sends one notification to every token. Results come back in token order. */
export async function sendFcm(
    credentials: FcmCredentials,
    tokens: readonly string[],
    notification: NativeNotification
): Promise<NativeDelivery[]> {
    const proxyUrl = process.env.SPLIT_PUSH_PROXY_URL
    let bearer: string
    try {
        bearer = await accessToken(credentials, proxyUrl)
    } catch {
        console.warn('[split] fcm auth failed')
        return tokens.map(() => ({ ok: false, dead: false }))
    }
    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.projectId)}/messages:send`
    return Promise.all(
        tokens.map(async (token): Promise<NativeDelivery> => {
            try {
                const response = await egressFetch(proxyUrl, url, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(fcmMessage(token, notification)),
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                })
                if (response.ok) return { ok: true, dead: false, statusCode: response.status }
                const body = await response.json().catch(() => null)
                console.warn('[split] fcm delivery failed', { status: response.status })
                return { ok: false, dead: isDeadFcmToken(response.status, body), statusCode: response.status }
            } catch {
                console.warn('[split] fcm delivery failed', { status: 'request-error' })
                return { ok: false, dead: false }
            }
        })
    )
}
