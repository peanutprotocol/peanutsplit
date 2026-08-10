'use client'

/**
 * The earned install ask, kept entirely on this device.
 *
 * A roster name is a ledger participant, not an account or an invitation state. The only origin
 * recorded here is therefore about this browser: did it create this room, or did it open one that
 * already existed? That distinction never leaves the device and never grants permission.
 */

export type RoomInstallOrigin = 'created_here' | 'opened_here'
export type AutoInstallTrigger = 'balance_and_share' | 'mature_contribution' | 'mature_return'

export interface RoomInstallFunnelState {
    version: 1
    origin: RoomInstallOrigin
    /** A real native-share resolution or clipboard write; presentation alone is not success. */
    shareCompletedAt?: number
    /** Legacy observation only. New return decisions use active/away evidence below. */
    lastMatureVisitAt?: number
    /** Most recent heartbeat while this mature, unsettled room was visibly in use. */
    lastMatureActiveAt?: number
    /** Explicit hidden/blur/pagehide boundary. Kept until the next visible entry evaluates it. */
    matureAwaySince?: number
    qualifiedTrigger?: AutoInstallTrigger
    qualifiedAt?: number
    /** A skipped post-aha share must not be replaced immediately by an install ask. */
    deferUntil?: number
}

type InstallStorage = Pick<Storage, 'getItem' | 'setItem'>

export const ROOM_INSTALL_KEY_PREFIX = 'ps:pwa-room:'
export const AUTO_INSTALL_SHOWN_AT_KEY = 'ps:pwa-auto-shown-at'
export const MATURE_RETURN_MS = 30 * 60 * 1000
export const MATURE_ACTIVITY_HEARTBEAT_MS = 60 * 1000
export const POST_AHA_SKIP_DEFER_MS = 30 * 60 * 1000
export const AUTO_INSTALL_SHOWN_COOLDOWN_MS = 24 * 60 * 60 * 1000
/** An old trip should not wake an install card months later merely because somebody edits it. */
export const INSTALL_QUALIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000

const TRIGGER_PRIORITY: Record<AutoInstallTrigger, number> = {
    mature_return: 1,
    mature_contribution: 2,
    balance_and_share: 3,
}

export const roomInstallStorageKey = (slug: string): string => `${ROOM_INSTALL_KEY_PREFIX}${slug}`

const browserStorage = (): InstallStorage | null => {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage
    } catch {
        return null
    }
}

const finiteTime = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

const parseState = (raw: string | null): RoomInstallFunnelState | null => {
    if (!raw) return null
    try {
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null) return null
        const value = parsed as Record<string, unknown>
        if (value.version !== 1 || (value.origin !== 'created_here' && value.origin !== 'opened_here')) return null
        const trigger = value.qualifiedTrigger
        const qualifiedTrigger =
            trigger === 'balance_and_share' || trigger === 'mature_contribution' || trigger === 'mature_return'
                ? trigger
                : undefined
        return {
            version: 1,
            origin: value.origin,
            shareCompletedAt: finiteTime(value.shareCompletedAt),
            lastMatureVisitAt: finiteTime(value.lastMatureVisitAt),
            lastMatureActiveAt: finiteTime(value.lastMatureActiveAt),
            matureAwaySince: finiteTime(value.matureAwaySince),
            qualifiedTrigger,
            qualifiedAt: qualifiedTrigger ? finiteTime(value.qualifiedAt) : undefined,
            deferUntil: finiteTime(value.deferUntil),
        }
    } catch {
        return null
    }
}

export function readRoomInstallFunnel(
    slug: string,
    store: InstallStorage | null = browserStorage()
): RoomInstallFunnelState {
    if (!store) return { version: 1, origin: 'opened_here' }
    try {
        return parseState(store.getItem(roomInstallStorageKey(slug))) ?? { version: 1, origin: 'opened_here' }
    } catch {
        return { version: 1, origin: 'opened_here' }
    }
}

const writeRoomState = (
    slug: string,
    state: RoomInstallFunnelState,
    store: InstallStorage | null
): RoomInstallFunnelState => {
    if (!store) return state
    try {
        store.setItem(roomInstallStorageKey(slug), JSON.stringify(state))
    } catch {
        // Private mode/quota: the settings row remains available even if the earned ask cannot persist.
    }
    return state
}

const qualificationIsFresh = (state: RoomInstallFunnelState, now: number): boolean =>
    state.qualifiedAt !== undefined &&
    state.qualifiedAt <= now &&
    now - state.qualifiedAt <= INSTALL_QUALIFICATION_TTL_MS

const qualify = (state: RoomInstallFunnelState, trigger: AutoInstallTrigger, now: number): RoomInstallFunnelState => {
    const current = qualificationIsFresh(state, now) ? state.qualifiedTrigger : undefined
    const winner = !current || TRIGGER_PRIORITY[trigger] >= TRIGGER_PRIORITY[current] ? trigger : current
    return {
        ...state,
        qualifiedTrigger: winner,
        // A fresh meaningful action refreshes the opportunity even when a stronger earlier reason wins.
        qualifiedAt: now,
    }
}

/** Mark the only device that can honestly be called the room-creation journey. */
export function markRoomCreatedHere(
    slug: string,
    store: InstallStorage | null = browserStorage()
): RoomInstallFunnelState {
    const current = readRoomInstallFunnel(slug, store)
    return writeRoomState(slug, { ...current, origin: 'created_here' }, store)
}

/**
 * Record a visible entry into a mature room. A return requires persisted away evidence: preferably
 * an explicit hidden/blur/pagehide boundary, with the last foreground heartbeat as the conservative
 * fallback for a killed process that never emitted one. The entry consumes that evidence so focus
 * churn cannot qualify twice.
 *
 * A previously completed share and the server's durable balance latch are independent milestones;
 * whichever arrives second completes `balance_and_share`.
 */
export function noteMatureRoomVisit(
    slug: string,
    now = Date.now(),
    store: InstallStorage | null = browserStorage()
): RoomInstallFunnelState {
    const current = readRoomInstallFunnel(slug, store)
    const hasExplicitAway = current.matureAwaySince !== undefined
    const awayEvidenceAt = hasExplicitAway ? current.matureAwaySince : current.lastMatureActiveAt
    const returned =
        current.origin === 'opened_here' &&
        awayEvidenceAt !== undefined &&
        awayEvidenceAt <= now &&
        now - awayEvidenceAt >= MATURE_RETURN_MS
    let next: RoomInstallFunnelState = {
        ...current,
        lastMatureVisitAt: now,
        lastMatureActiveAt: now,
        matureAwaySince: undefined,
    }
    const recentShare =
        current.shareCompletedAt !== undefined &&
        current.shareCompletedAt <= now &&
        now - current.shareCompletedAt <= INSTALL_QUALIFICATION_TTL_MS
    if (recentShare) next = qualify(next, 'balance_and_share', now)
    else if (returned) next = qualify(next, 'mature_return', now)
    return writeRoomState(slug, next, store)
}

/** Keep an open foreground session recent so elapsed wall time cannot masquerade as a return. */
export function noteMatureRoomActivity(
    slug: string,
    now = Date.now(),
    store: InstallStorage | null = browserStorage()
): RoomInstallFunnelState {
    const current = readRoomInstallFunnel(slug, store)
    return writeRoomState(slug, { ...current, lastMatureActiveAt: now, matureAwaySince: undefined }, store)
}

/** Persist the first boundary of one absence; duplicate blur/pagehide events must not move it. */
export function noteMatureRoomAway(
    slug: string,
    now = Date.now(),
    store: InstallStorage | null = browserStorage()
): RoomInstallFunnelState {
    const current = readRoomInstallFunnel(slug, store)
    const existingAway = current.matureAwaySince
    const matureAwaySince = existingAway !== undefined && existingAway <= now ? existingAway : now
    return writeRoomState(slug, { ...current, lastMatureActiveAt: now, matureAwaySince }, store)
}

/** A settled, join-gated, or otherwise ineligible room cannot bank an absence for a later ledger. */
export function clearMatureRoomReturnEvidence(
    slug: string,
    store: InstallStorage | null = browserStorage()
): RoomInstallFunnelState {
    const current = readRoomInstallFunnel(slug, store)
    const next = { ...current }
    delete next.lastMatureActiveAt
    delete next.matureAwaySince
    return writeRoomState(slug, next, store)
}

/** Record only a completed user-directed share, never an opened or aborted share sheet. */
export function noteRoomShareCompleted(
    slug: string,
    roomHasReachedSharedBalance: boolean,
    now = Date.now(),
    store: InstallStorage | null = browserStorage()
): RoomInstallFunnelState {
    const current = readRoomInstallFunnel(slug, store)
    let next: RoomInstallFunnelState = {
        ...current,
        shareCompletedAt: now,
        deferUntil: undefined,
    }
    if (roomHasReachedSharedBalance) next = qualify(next, 'balance_and_share', now)
    return writeRoomState(slug, next, store)
}

/**
 * An invitee's later, acknowledged ledger contribution is a retention signal. The caller supplies
 * pre-mutation maturity and the local-queue result so the expense that creates aha, and a write the
 * server has never seen, cannot accidentally qualify.
 */
export function noteMatureContribution(
    slug: string,
    options: { roomWasMature: boolean; queuedLocally: boolean; createdFirstSharedBalance: boolean },
    now = Date.now(),
    store: InstallStorage | null = browserStorage()
): RoomInstallFunnelState {
    const current = readRoomInstallFunnel(slug, store)
    if (
        current.origin !== 'opened_here' ||
        !options.roomWasMature ||
        options.queuedLocally ||
        options.createdFirstSharedBalance
    )
        return current
    return writeRoomState(slug, qualify({ ...current, deferUntil: undefined }, 'mature_contribution', now), store)
}

export function deferRoomInstallAfterSkippedShare(
    slug: string,
    now = Date.now(),
    store: InstallStorage | null = browserStorage()
): RoomInstallFunnelState {
    const current = readRoomInstallFunnel(slug, store)
    return writeRoomState(slug, { ...current, deferUntil: now + POST_AHA_SKIP_DEFER_MS }, store)
}

export function eligibleRoomInstallTrigger(
    slug: string,
    now = Date.now(),
    store: InstallStorage | null = browserStorage()
): AutoInstallTrigger | null {
    const state = readRoomInstallFunnel(slug, store)
    if (!state.qualifiedTrigger || !qualificationIsFresh(state, now)) return null
    if (state.deferUntil !== undefined && now < state.deferUntil) return null
    // Creation journeys earn the ask specifically through collaborative value. Opened-room
    // journeys may additionally earn it by contributing or deliberately returning.
    if (state.origin === 'created_here' && state.qualifiedTrigger !== 'balance_and_share') return null
    return state.qualifiedTrigger
}

const readShownAt = (store: InstallStorage | null): number => {
    if (!store) return 0
    try {
        const raw = store.getItem(AUTO_INSTALL_SHOWN_AT_KEY)
        const parsed = raw === null ? NaN : Number.parseInt(raw, 10)
        return Number.isFinite(parsed) ? parsed : 0
    } catch {
        return 0
    }
}

export function wasAutoInstallShownRecently(
    now = Date.now(),
    store: InstallStorage | null = browserStorage()
): boolean {
    const shownAt = readShownAt(store)
    return shownAt > 0 && now - shownAt < AUTO_INSTALL_SHOWN_COOLDOWN_MS
}

export function noteAutoInstallShown(now = Date.now(), store: InstallStorage | null = browserStorage()): void {
    if (!store) return
    try {
        store.setItem(AUTO_INSTALL_SHOWN_AT_KEY, String(now))
    } catch {
        // The in-memory shown guard still prevents a second card in this page life.
    }
}
