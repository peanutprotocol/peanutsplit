/**
 * Who you are, per room, on this device. There are no accounts — identity is a
 * localStorage record and the room slug is the credential.
 *
 * Two shapes remain readable for backwards compatibility:
 *  - you created the room, or joined as a new member → we hold a server-issued
 *    `token` (sent as `X-Member-Token`, attribution only);
 *  - an older client stored a tokenless existing-member claim. New claims
 *    receive the member's existing token so reactions and push work.
 *
 * A device UUID (`ps:device`) is minted once and mirrored into a `device-id`
 * cookie so a future OAuth claim flow — which arrives with no request body — can
 * still find this device's anonymous history server-side.
 */

export interface MemberIdentity {
    memberId: string
    name: string
    /** Undefined only for legacy tokenless claims or unavailable storage. */
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

/**
 * How many times this tab has claimed an identity in a room.
 *
 * It exists so a request that started before a claim can tell that it is now
 * stale — see `dropRoomSubscription`, where a late browser-level unsubscribe
 * would otherwise revoke a channel the NEW identity had just created. In memory
 * and per tab is all it has to be: both ends of that comparison happen inside one
 * page life, and a reload has no in-flight request left to guard.
 *
 * Counted rather than compared against the stored identity on purpose. The same
 * person re-claiming the same member gets the same memberId and the same token
 * back, so "is the identity still the one I captured" answers yes to the exact
 * hand-back-the-phone-to-yourself case that has to be caught.
 */
const claims = new Map<string, number>()

/** Capture this before an async job whose last step would be wrong if somebody
 *  claimed an identity in `slug` while it was in flight. */
export const identityGeneration = (slug: string): number => claims.get(slug) ?? 0

/** Store (or replace) the identity for `slug`. Call this the instant a token
 *  comes back from room creation, a new join, or an existing-member claim. */
export function writeIdentity(slug: string, identity: MemberIdentity): void {
    // Before the storage check, deliberately: the claim has happened either way —
    // React state already holds the new member — and a blocked localStorage must
    // not make an in-flight unsubscribe think it is still current.
    claims.set(slug, identityGeneration(slug) + 1)
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

const isDeviceId = (value: string | null): value is string =>
    value !== null &&
    (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ||
        /^dev-[a-z0-9]{8,80}$/i.test(value))

const writeDeviceCookie = (deviceId: string): void => {
    try {
        if (typeof document === 'undefined') return
        const secure = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? '; Secure' : ''
        document.cookie = `${DEVICE_COOKIE}=${encodeURIComponent(deviceId)}; path=/; max-age=${DEVICE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
    } catch {
        // ignore
    }
}

/**
 * WebKit copies cookies, but not localStorage, into a newly-added Home Screen
 * app. Read the mirrored id before minting so that one-time copy remains the
 * same anonymous device instead of being overwritten on the installed app's
 * first Providers effect.
 */
const readDeviceCookie = (): string | null => {
    try {
        if (typeof document === 'undefined') return null
        for (const part of document.cookie.split(';')) {
            const [name, ...rawValue] = part.trim().split('=')
            if (name !== DEVICE_COOKIE) continue
            const value = decodeURIComponent(rawValue.join('='))
            // A device id is only a hint, but bounding its shape keeps a damaged
            // or attacker-written cookie from becoming durable application state.
            return isDeviceId(value) ? value : null
        }
    } catch {
        // An unreadable/malformed cookie falls through to ordinary minting.
    }
    return null
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
        const stored = store.getItem(DEVICE_KEY)
        deviceId = isDeviceId(stored) ? stored : null
    } catch {
        return null
    }
    if (!deviceId) {
        deviceId = readDeviceCookie() ?? randomUuid()
        try {
            store.setItem(DEVICE_KEY, deviceId)
        } catch {
            return null
        }
    }
    writeDeviceCookie(deviceId)
    return deviceId
}
