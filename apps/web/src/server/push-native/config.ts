/**
 * Which app push services this server can deliver to, read from the runtime
 * environment.
 *
 * Every value is optional. Without them the subscribe and status routes answer
 * 503 NATIVE_PUSH_UNAVAILABLE, the app hides its notification row, and the
 * fan-out skips native rows. Setting them on the server turns app push on with
 * no store release. Like the VAPID pair, the APNs key and the FCM service
 * account are never rotated in place without a plan for the stored tokens.
 */
import type { NativePushTransport } from '@/lib/api-types'
import { ApiError } from '@/server/http'

export const NATIVE_PUSH_TRANSPORTS = ['apns', 'apns-sandbox', 'fcm'] as const satisfies readonly NativePushTransport[]

export interface ApnsCredentials {
    /** PEM text of the `.p8` key. */
    keyP8: string
    keyId: string
    teamId: string
    /** The app's bundle ID, sent as `apns-topic`. */
    bundleId: string
}

export interface FcmCredentials {
    projectId: string
    clientEmail: string
    privateKey: string
}

export function apnsCredentials(): ApnsCredentials | null {
    const keyP8 = process.env.SPLIT_APNS_KEY_P8
    const keyId = process.env.SPLIT_APNS_KEY_ID
    const teamId = process.env.SPLIT_APNS_TEAM_ID
    const bundleId = process.env.SPLIT_APNS_BUNDLE_ID
    if (!keyP8 || !keyId || !teamId || !bundleId) return null
    // Secret stores often keep a multi-line PEM as one line with literal \n.
    return { keyP8: keyP8.replace(/\\n/g, '\n'), keyId, teamId, bundleId }
}

export function fcmCredentials(): FcmCredentials | null {
    const raw = process.env.SPLIT_FCM_SERVICE_ACCOUNT_JSON
    if (!raw) return null
    try {
        const json = JSON.parse(raw) as { project_id?: unknown; client_email?: unknown; private_key?: unknown }
        const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = json
        if (typeof projectId !== 'string' || typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
            return null
        }
        return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }
    } catch {
        // A malformed value is treated as unset: the routes answer 503 instead
        // of storing tokens that every send would then fail on.
        return null
    }
}

export function isNativePushAvailable(transport: NativePushTransport): boolean {
    return transport === 'fcm' ? fcmCredentials() !== null : apnsCredentials() !== null
}

/**
 * The routes' gate for app tokens. It runs before the room lookup, so it says
 * nothing about whether a room exists. The app hides its notification row on
 * this code, so a store build never shows a button the server cannot serve.
 */
export function assertNativePushAvailable(transport: NativePushTransport | 'webpush'): void {
    if (transport !== 'webpush' && !isNativePushAvailable(transport)) {
        throw new ApiError(503, 'NATIVE_PUSH_UNAVAILABLE', 'app notifications are not configured on this server')
    }
}
