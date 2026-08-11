/**
 * The room has one optional guidance slot.
 *
 * Persistent utility controls (Add expense, Settle up, header Share and Settings) do not own it.
 * Temporary journeys do: identity/recovery, an open form or sheet, the empty-room activation
 * choice, a latecomer correction, a just-earned all-settled moment, or an achievement. Install is
 * the explicit fallback when none of those moments needs the slot.
 *
 * Keep this resolver pure. RoomScreen owns the facts and InstallPrompt owns delivery/backoff; this
 * module only makes their priority visible and exhaustively testable.
 */

export const ROOM_GUIDANCE_PRIORITY = [
    'identity',
    'recovery',
    'post_aha_share',
    'active_flow',
    'room_activation',
    'latecomer_review',
    'all_settled_moment',
    'achievement',
    'install',
] as const

export type RoomGuidanceOwner = (typeof ROOM_GUIDANCE_PRIORITY)[number]
type CompetingRoomGuidanceOwner = Exclude<RoomGuidanceOwner, 'install'>

export interface RoomGuidanceSignals {
    /** Join, re-join, or displaced-device identity recovery owns the viewport. */
    identity: boolean
    /** Stale state, an error, or a queued draft requiring attention. */
    recovery: boolean
    /** The automatic first-shared-balance Share journey, called out from user-opened sheets. */
    postAhaShare: boolean
    /** Any open drawer, form, confirmation, or other temporarily modal room task. */
    activeFlow: boolean
    /** The empty room's Create first expense / Share choice. */
    roomActivation: boolean
    /** The unresolved latecomer banner or its review. */
    latecomerReview: boolean
    /** Only the newly reached celebration, never the durable fact that a room is settled. */
    allSettledMoment: boolean
    /** A one-shot achievement card that is currently asking to be shared or dismissed. */
    achievement: boolean
}

const SIGNAL_FOR_OWNER = {
    identity: 'identity',
    recovery: 'recovery',
    post_aha_share: 'postAhaShare',
    active_flow: 'activeFlow',
    room_activation: 'roomActivation',
    latecomer_review: 'latecomerReview',
    all_settled_moment: 'allSettledMoment',
    achievement: 'achievement',
} as const satisfies Record<CompetingRoomGuidanceOwner, keyof RoomGuidanceSignals>

export function resolveRoomGuidance(signals: RoomGuidanceSignals): RoomGuidanceOwner {
    for (const owner of ROOM_GUIDANCE_PRIORITY) {
        if (owner === 'install' || signals[SIGNAL_FOR_OWNER[owner]]) return owner
    }
    // `install` is the tuple's exhaustive final member. This is unreachable, but keeping a return
    // makes the invariant explicit to TypeScript if its control-flow analysis changes.
    return 'install'
}
