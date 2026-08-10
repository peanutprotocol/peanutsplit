/**
 * Safari installs a Home Screen app into a fresh storage container. WebKit copies
 * cookies once, but not localStorage, so a short-lived opaque server handoff is
 * the bridge for the room the person explicitly installed from.
 *
 * The secret cookie is HttpOnly and never appears here. This readable marker is
 * only a `1`: it lets `/app` avoid making a doomed request on every ordinary
 * launch. The server remains the authority for the opaque token and payload.
 */

import { api, isApiError, type InstallHandoffPayload } from './api'
import { track } from './analytics'
import { clearIdentity, readIdentity, writeIdentity } from './identity'
import { readRecentRooms, rememberRoom, roomSlugFromLink } from './recent-rooms'
import { isStandaloneDisplay } from './push-status'

export const INSTALL_HANDOFF_READY_COOKIE = '__Host-ps-install-handoff-ready'
const INSTALL_HANDOFF_PREPARE_INTENT_KEY = 'ps:install-handoff-prepare-intent'
const INSTALL_HANDOFF_PREPARE_LOCK = 'ps-install-handoff-prepare'

// Fallback for a non-supporting test/old browser realm. Current iOS WebKit has
// Web Locks, whose branch below coordinates tabs and windows across the origin.
let prepareQueue: Promise<void> = Promise.resolve()

interface InstallLockManager {
    request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

export interface PreparedInstallHandoff {
    /** Opaque client-side generation; never sent to analytics or the server. */
    intent: string
}

const withPrepareLock = <T>(operation: () => Promise<T>): Promise<T> => {
    const locks = (window.navigator as unknown as { locks?: InstallLockManager }).locks
    if (locks) return locks.request(INSTALL_HANDOFF_PREPARE_LOCK, operation)

    const result = prepareQueue.then(operation)
    prepareQueue = result.then(
        () => undefined,
        () => undefined
    )
    return result
}

const clearPreparedReadyMarker = (): void => {
    try {
        if (typeof document === 'undefined') return
        document.cookie = `${INSTALL_HANDOFF_READY_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Strict`
    } catch {
        // A blocked cookie jar makes a safe handoff impossible; the caller will
        // keep the instructions closed.
    }
}

const beginPrepareIntent = (): string | null => {
    if (typeof window === 'undefined') return null
    try {
        const id =
            globalThis.crypto?.randomUUID?.() ??
            `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
        window.localStorage.setItem(INSTALL_HANDOFF_PREPARE_INTENT_KEY, id)
        // While a newer room is being prepared, no older copied cookie is
        // allowed to claim it is ready. The secret remains HttpOnly and expires
        // server-side; clearing this non-secret gate fails restoration closed.
        clearPreparedReadyMarker()
        return id
    } catch {
        return null
    }
}

const isLatestPrepareIntent = (id: string): boolean => {
    try {
        return window.localStorage.getItem(INSTALL_HANDOFF_PREPARE_INTENT_KEY) === id
    } catch {
        return false
    }
}

export type InstallHandoffBootResult =
    | { status: 'not-needed' }
    | { status: 'definitive-miss' }
    | { status: 'transient-failure' }
    | { status: 'restored'; roomPath: string }

interface InstallHandoffClient {
    redeem: (signal?: AbortSignal) => Promise<InstallHandoffPayload>
    acknowledge: (signal?: AbortSignal) => Promise<void>
}

const cookieValue = (cookieHeader: string, name: string): string | null => {
    for (const part of cookieHeader.split(';')) {
        const [rawName, ...rawValue] = part.trim().split('=')
        if (rawName !== name) continue
        try {
            return decodeURIComponent(rawValue.join('='))
        } catch {
            return null
        }
    }
    return null
}

export const hasPreparedInstallHandoff = (cookieHeader: string): boolean =>
    cookieValue(cookieHeader, INSTALL_HANDOFF_READY_COOKIE) === '1'

export function isStandaloneInstallLaunch(): boolean {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false
    const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }
    return isStandaloneDisplay(
        window.matchMedia?.('(display-mode: standalone)').matches ?? false,
        navigatorWithStandalone.standalone
    )
}

/**
 * Ask the server to arm the one-time cookie before showing iOS's manual steps.
 * A room-scoped CTA must open its iOS steps only when this returns a handle. Showing
 * them after failure could leave an older prepared cookie armed and restore the
 * wrong room. The handle lets a surface invalidate a successful response that
 * became stale while it was in flight.
 */
export function prepareInstallHandoff(slug: string, token?: string | null): Promise<PreparedInstallHandoff | null> {
    const intent = beginPrepareIntent()
    if (!intent) return Promise.resolve(null)

    const prepare = async (): Promise<PreparedInstallHandoff | null> => {
        try {
            const result = await api.installHandoff.prepare(slug, token)
            const ready =
                result?.prepared === true &&
                typeof document !== 'undefined' &&
                hasPreparedInstallHandoff(document.cookie)
            if (ready && isLatestPrepareIntent(intent)) return { intent }
            clearPreparedReadyMarker()
            return null
        } catch {
            clearPreparedReadyMarker()
            return null
        }
    }

    return withPrepareLock(prepare).catch(() => {
        clearPreparedReadyMarker()
        return null
    })
}

/** A surface can disappear while its successful Set-Cookie response is in
 * flight. Re-check the generation under the same origin-wide lock before
 * clearing/ACKing, so cancellation can never consume a newer room's intent. */
export function cancelPreparedInstallHandoff(prepared: PreparedInstallHandoff): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve()
    return withPrepareLock(async () => {
        if (!isLatestPrepareIntent(prepared.intent)) return
        clearPreparedReadyMarker()
        try {
            await api.installHandoff.acknowledge()
        } catch {
            // The readable marker already fails first launch closed; the server
            // row is inaccessible after 24h and is removed by the retention sweep.
        }
    }).catch(() => {
        if (isLatestPrepareIntent(prepared.intent)) {
            clearPreparedReadyMarker()
        }
    })
}

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string'

/** The wire is same-origin, but malformed state must not become a navigation credential. */
function validPayload(value: unknown): value is InstallHandoffPayload {
    if (typeof value !== 'object' || value === null) return false
    const { room, identity } = value as { room?: unknown; identity?: unknown }
    if (typeof room !== 'object' || room === null) return false
    const candidate = room as Record<string, unknown>
    if (typeof candidate.slug !== 'string' || typeof candidate.name !== 'string' || candidate.name.length === 0)
        return false
    if (!isNullableString(candidate.emoji) || !isNullableString(candidate.theme)) return false
    if (identity === null) return true
    if (typeof identity !== 'object' || identity === null) return false
    const member = identity as Record<string, unknown>
    return (
        typeof member.memberId === 'string' &&
        member.memberId.length > 0 &&
        typeof member.name === 'string' &&
        member.name.length > 0 &&
        typeof member.token === 'string' &&
        member.token.length > 0
    )
}

/**
 * Persist and read back both halves before the server is allowed to consume the
 * handoff. Retrying after any partial write is safe: both writes are upserts.
 */
export function persistInstallHandoff(payload: unknown): string | null {
    if (!validPayload(payload) || typeof window === 'undefined') return null

    const { room, identity } = payload
    const slug = roomSlugFromLink(`/r/${room.slug}`, window.location.origin)
    if (slug !== room.slug) return null

    // Local timestamps are untrusted and can be ahead of this device's clock. The
    // explicit install room still wins: put it one tick above the current maximum
    // (or tie at MAX_SAFE_INTEGER, where stable sorting keeps the inserted row first).
    const newestSeenAt = readRecentRooms()[0]?.lastSeenAt ?? 0
    const lastSeenAt = Math.max(Date.now(), Math.min(Number.MAX_SAFE_INTEGER, newestSeenAt + 1))
    if (
        !rememberRoom({
            slug,
            name: room.name,
            emoji: room.emoji ?? undefined,
            theme: room.theme ?? undefined,
            lastSeenAt,
        })
    )
        return null

    if (identity) writeIdentity(slug, identity)
    else clearIdentity(slug)

    const remembered = readRecentRooms()[0]
    if (
        remembered?.slug !== slug ||
        remembered.name !== room.name ||
        remembered.emoji !== (room.emoji ?? undefined) ||
        remembered.theme !== (room.theme ?? undefined)
    )
        return null

    if (identity) {
        const stored = readIdentity(slug)
        if (stored?.memberId !== identity.memberId || stored.name !== identity.name || stored.token !== identity.token)
            return null
    } else if (readIdentity(slug) !== null) {
        return null
    }

    return `/r/${encodeURIComponent(slug)}`
}

/**
 * Resolve the special first-launch branch for `/app`.
 *
 * A regular tab never calls the endpoint. The server's definitive 404 clears the
 * marker and falls through to normal recent-room routing. A timeout, network
 * failure, 429 or 5xx keeps the marker and reveals the usable chooser instead of
 * silently redirecting to an older room. ACK failure is different: local
 * restoration is already durable, and the idempotent row can be retried next
 * launch.
 */
export async function restorePreparedInstallHandoff(
    signal?: AbortSignal,
    client: InstallHandoffClient = api.installHandoff
): Promise<InstallHandoffBootResult> {
    if (typeof document === 'undefined' || !isStandaloneInstallLaunch() || !hasPreparedInstallHandoff(document.cookie))
        return { status: 'not-needed' }

    let payload: InstallHandoffPayload
    try {
        payload = await client.redeem(signal)
    } catch (error) {
        return isApiError(error, 'INSTALL_HANDOFF_UNAVAILABLE')
            ? { status: 'definitive-miss' }
            : { status: 'transient-failure' }
    }

    const roomPath = persistInstallHandoff(payload)
    if (!roomPath) return { status: 'transient-failure' }

    // Local restoration is already verified, so navigation must not sit behind a
    // second network deadline. ACK continues without the boot component's abort
    // signal: a route replacement is success, not a reason to cancel cleanup.
    void client
        .acknowledge()
        .then(() => {
            // This is the closest iOS equivalent to Chromium's `appinstalled`: a prepared room
            // reached a standalone storage container, survived a local write/read round-trip, and
            // consumed its server bridge. It deliberately says handoff, not install; WebKit exposes
            // no programmable installation event.
            track('pwa_ios_install_handoff_completed')
        })
        .catch(() => {
            // Leaving the idempotent token armed is safer than hiding the restored
            // room because an ACK response was lost.
        })

    return { status: 'restored', roomPath }
}
