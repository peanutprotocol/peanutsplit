/**
 * Who you are, per room, on this device. There are no accounts — identity is a
 * localStorage record and the room slug is the credential.
 *
 * Two shapes exist by design:
 *  - you created the room, or joined as a new member → we hold a server-issued
 *    `token` (sent as `X-Member-Token`, attribution only);
 *  - you tapped an existing member on the join gate ("I'm Bea") → no token exists
 *    for that member on this device, and that is fine. Writes still work; they
 *    are simply unattributed.
 *
 * A device UUID (`ps:device`) is minted once and mirrored into a `device-id`
 * cookie so a future OAuth claim flow — which arrives with no request body — can
 * still find this device's anonymous history server-side.
 */

export interface MemberIdentity {
    memberId: string
    name: string
    /** Undefined for claimed-existing-member identities. */
    token?: string
}

export const MEMBER_KEY_PREFIX = 'ps:member:'
export const DEVICE_KEY = 'ps:device'
export const DEVICE_COOKIE = 'device-id'

/** Ten years — the cookie must outlive the PWA being evicted and reinstalled. */
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10

export const memberStorageKey = (slug: string): string => `${MEMBER_KEY_PREFIX}${slug}`

const storage = (): Storage | null => {
    try {
        if (typeof window === 'undefined') return null
        return window.localStorage ?? null
    } catch {
        // Safari in lockdown / private mode throws on access, not on use.
        return null
    }
}

/** The identity stored for `slug`, or null if this device has never joined it. */
export function readIdentity(slug: string): MemberIdentity | null {
    const store = storage()
    if (!store) return null
    try {
        const raw = store.getItem(memberStorageKey(slug))
        if (!raw) return null
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null) return null
        const { memberId, name, token } = parsed as Record<string, unknown>
        if (typeof memberId !== 'string' || memberId.length === 0) return null
        if (typeof name !== 'string' || name.length === 0) return null
        return typeof token === 'string' && token.length > 0 ? { memberId, name, token } : { memberId, name }
    } catch {
        return null
    }
}

/** Store (or replace) the identity for `slug`. Call this the instant a token
 *  comes back — the server returns it exactly once. */
export function writeIdentity(slug: string, identity: MemberIdentity): void {
    const store = storage()
    if (!store) return
    const payload: MemberIdentity = { memberId: identity.memberId, name: identity.name }
    if (identity.token) payload.token = identity.token
    try {
        store.setItem(memberStorageKey(slug), JSON.stringify(payload))
    } catch {
        // Quota / private mode. Nothing useful to tell the user here.
    }
}

/** Forget who you are in this room (the "not me" escape hatch). */
export function clearIdentity(slug: string): void {
    const store = storage()
    if (!store) return
    try {
        store.removeItem(memberStorageKey(slug))
    } catch {
        // ignore
    }
}

const randomUuid = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    // Non-secure fallback for the handful of browsers without randomUUID; this
    // value is an analytics/claim hint, never a credential.
    return `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

const writeDeviceCookie = (deviceId: string): void => {
    try {
        if (typeof document === 'undefined') return
        document.cookie = `${DEVICE_COOKIE}=${deviceId}; path=/; max-age=${DEVICE_COOKIE_MAX_AGE}; SameSite=Lax`
    } catch {
        // ignore
    }
}

/**
 * Read-or-mint the device UUID and (re)mirror it into the cookie. Idempotent —
 * safe to call on every mount. Returns null when storage is unavailable.
 */
export function ensureDeviceId(): string | null {
    const store = storage()
    if (!store) return null
    let deviceId: string | null = null
    try {
        deviceId = store.getItem(DEVICE_KEY)
    } catch {
        return null
    }
    if (!deviceId) {
        deviceId = randomUuid()
        try {
            store.setItem(DEVICE_KEY, deviceId)
        } catch {
            return null
        }
    }
    writeDeviceCookie(deviceId)
    return deviceId
}
