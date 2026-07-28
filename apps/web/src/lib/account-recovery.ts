/**
 * The two halves of "your rooms followed you here", as pure functions.
 *
 * Both run exactly once, right after a magic link is spent, and both touch
 * localStorage — which is why neither of them does. They take what the device
 * holds and return what should be written; the component that owns the effect
 * does the writing. That keeps the only logic worth getting wrong (what counts
 * as proof, and whose identity may be overwritten) testable without a browser.
 */

import type { AccountRoom, MembershipClaim } from './api-types'
import type { MemberIdentity } from './identity'
import type { RecentRoom } from './recent-rooms'

/** Matches `attachSchema`'s ceiling. Sending more is a 400, and losing the whole
 *  batch to one over-long history would be a silly way to fail. */
export const MAX_ATTACH_CLAIMS = 50

/**
 * Everything on this device the account is allowed to adopt.
 *
 * Token-less identities are dropped, not sent: tapping "I'm Bea" on the join
 * gate is believed inside a room (impersonation there is visible and fixable)
 * but the server refuses to harden it into an account graph, so a claim without
 * a token is a guaranteed `token-mismatch` and pure noise in the batch.
 */
export function collectMemberships(
    slugs: string[],
    readIdentity: (slug: string) => MemberIdentity | null
): MembershipClaim[] {
    const claims: MembershipClaim[] = []
    const seen = new Set<string>()
    for (const slug of slugs) {
        if (seen.has(slug)) continue
        seen.add(slug)
        const identity = readIdentity(slug)
        if (!identity?.token) continue
        claims.push({ slug, memberId: identity.memberId, token: identity.token })
        if (claims.length === MAX_ATTACH_CLAIMS) break
    }
    return claims
}

export interface RecoveryPlan {
    /** Rooms to fold into the recent list, each with the timestamp it should
     *  sort by. */
    remember: RecentRoom[]
    /** Identities to write, keyed by room. Only ever additive — see below. */
    identities: { slug: string; identity: MemberIdentity }[]
}

export interface RecoveryInput {
    /** What the recent-rooms list already holds on this device. */
    recent: RecentRoom[]
    readIdentity: (slug: string) => MemberIdentity | null
    now: number
}

/**
 * Turns the account's room list into local writes.
 *
 * Two rules, both about not overwriting a person's own choices:
 *
 *  - a room this device already knows keeps its real `lastSeenAt`, so recovery
 *    does not reshuffle a list someone was reading five seconds ago. Rooms that
 *    are genuinely new to the device land at the top in server order, which is
 *    the "your rooms are back" moment;
 *  - an identity is written only where there is nothing to lose: no local
 *    identity at all (the new-phone case), or one for the same member that is
 *    missing its token (an upgrade — it unlocks push, and it cannot change who
 *    you are). A different memberId is left alone: somebody deliberately being
 *    "Bea" on this device stays Bea.
 */
export function planRecovery(rooms: AccountRoom[], { recent, readIdentity, now }: RecoveryInput): RecoveryPlan {
    const lastSeenBySlug = new Map(recent.map((room) => [room.slug, room.lastSeenAt]))
    const plan: RecoveryPlan = { remember: [], identities: [] }
    const seen = new Set<string>()

    rooms.forEach((room, index) => {
        if (seen.has(room.slug)) return
        seen.add(room.slug)

        plan.remember.push({
            slug: room.slug,
            name: room.name,
            emoji: room.emoji ?? undefined,
            lastSeenAt: lastSeenBySlug.get(room.slug) ?? now - index,
        })

        const local = readIdentity(room.slug)
        const missing = local === null
        const tokenlessSameMember = local !== null && local.memberId === room.memberId && !local.token
        if (missing || tokenlessSameMember) {
            plan.identities.push({
                slug: room.slug,
                identity: {
                    memberId: room.memberId,
                    // Keep the name this device chose to show, if it has one.
                    name: local?.name ?? room.memberName,
                    token: room.memberToken,
                },
            })
        }
    })

    return plan
}
