/**
 * Somebody joined after the spending started. Which of the earlier expenses were
 * they supposed to be in, and which is it none of our business to touch?
 *
 * The problem this exists for: shares are written when the expense is saved, so
 * the fifth person to tap the link is not in the four dinners that happened
 * before they did. Every one of those is a real, wrong number sitting in a room
 * people are going to argue over, and the manual repair is opening N expenses
 * and re-ticking a box in each. One tap is the honest size of that job.
 *
 * THE PREDICATE, and why it is what it is. An EQUAL expense should get the
 * latecomer added only when their absence was an accident of timing rather than
 * a decision. Three things have to hold:
 *
 *  1. **It is EQUAL.** Exact amounts, percentages and shares are deliberate
 *     arithmetic. There is no reading of "add one more" that does not overwrite
 *     that choice, so non-EQUAL expenses are never offered or touched.
 *  2. **It predates them.** `expense.createdAt < member.createdAt`. If they were
 *     already on the roster when it was written, leaving them out was a choice
 *     somebody made in the drawer, and choices are not accidents.
 *  3. **It was everyone at the time.** The expense's share set is exactly the set
 *     of members who existed when it was written. A dinner three of the five
 *     went to is not a room-wide expense with somebody missing; it is a dinner
 *     three people went to, and adding a sixth to it would be inventing a fact.
 *
 * A share COUNT (`shares.length === membersBefore.length`) is the cheap version
 * of (3) and is nearly always the same answer — but only nearly. Two people
 * joining, one earlier expense that skipped one of them, and the count matches
 * while the SET does not. The set is what the sentence "everyone at the time"
 * actually means, `createdAt` is on the wire for both members and expenses, so
 * the exact test costs one `Set` and is the one worth writing.
 *
 * Where the timestamps are ambiguous — a member created in the same millisecond
 * as an expense — (2) reads them as NOT a latecomer for that row and (3) counts
 * them as present. Both fall the same way: the expense is skipped. Skipping a
 * row somebody then fixes by hand is a small cost; silently re-splitting a row
 * that was correct is not.
 */

import type { ApiExpense, ApiMember, CatchUpExpenseInput, RoomState } from './api-types'
import { savedExpenses } from './pending'

/** How one earlier row can be handled in the review UI. */
export type LatecomerReviewKind = 'suggested' | 'optional' | 'manual'

export interface LatecomerReviewItem {
    expense: ApiExpense
    /**
     * suggested: an equal split that contained everyone who existed then;
     * optional: an equal subset, safe to express but never safe to assume;
     * manual: exact/weighted arithmetic that needs the expense editor.
     */
    kind: LatecomerReviewKind
    /** The new member's room-currency share. Null when the app must not guess. */
    impactMinor: string | null
}

export interface LatecomerReview {
    member: ApiMember
    /** Newest first, matching the room ledger. */
    items: LatecomerReviewItem[]
}

const at = (iso: string): number => new Date(iso).getTime()

/**
 * The earlier expenses `memberId` should be in. Empty for anybody who was there
 * from the start, and empty once the repair has run — which is what makes the
 * whole flow resumable: an expense that already holds their share fails the
 * "not already in it" test and drops out of the list on the next render.
 */
export function backfillableFor(state: RoomState, memberId: string): ApiExpense[] {
    const member = state.members.find((candidate) => candidate.id === memberId)
    if (!member) return []
    const joinedAt = at(member.createdAt)

    return savedExpenses(state.expenses).filter((expense) => {
        if (expense.splitMode !== 'EQUAL') return false
        const writtenAt = at(expense.createdAt)
        if (!(writtenAt < joinedAt)) return false

        const shareHolders = new Set(expense.shares.map((share) => share.memberId))
        if (shareHolders.has(memberId)) return false

        const presentThen = state.members.filter((candidate) => at(candidate.createdAt) <= writtenAt)
        if (presentThen.length !== shareHolders.size) return false
        return presentThen.every((candidate) => shareHolders.has(candidate.id))
    })
}

/**
 * The actual history a new member can review, including rows the conservative
 * suggestion predicate intentionally excludes.
 *
 * Equal subsets are safe to OFFER because adding the member can be represented
 * without inventing weights or amounts: the participant set becomes the old
 * set plus this one member. They start off because attendance is a human fact.
 * Exact, percentage and shares rows are visible but manual; changing those
 * automatically would overwrite deliberate arithmetic.
 */
export function latecomerReview(state: RoomState, memberId: string): LatecomerReview | null {
    const member = state.members.find((candidate) => candidate.id === memberId)
    if (!member) return null
    const joinedAt = at(member.createdAt)

    const items = savedExpenses(state.expenses).flatMap((expense): LatecomerReviewItem[] => {
        const writtenAt = at(expense.createdAt)
        if (!(writtenAt < joinedAt)) return []

        const shareHolders = new Set(expense.shares.map((share) => share.memberId))
        if (shareHolders.has(memberId)) return []

        if (expense.splitMode !== 'EQUAL') {
            return [{ expense, kind: 'manual', impactMinor: null }]
        }

        // An empty or orphaned participant set is not safe to rewrite from the
        // client. The ordinary editor can expose whatever repair is appropriate.
        if (
            shareHolders.size === 0 ||
            expense.shares.some((share) => !state.members.some((candidate) => candidate.id === share.memberId))
        ) {
            return [{ expense, kind: 'manual', impactMinor: null }]
        }

        const presentThen = state.members.filter((candidate) => at(candidate.createdAt) <= writtenAt)
        // Later-created holders are extras, not evidence that this stopped being
        // a whole-room expense. This is how a second latecomer can review a row
        // after the first latecomer was already caught up.
        const wholeRoomThen = presentThen.every((candidate) => shareHolders.has(candidate.id))

        // The new participant is appended by the atomic command. Equal apportionment
        // gives rounding residue to earlier participant positions, so the final
        // participant receives the floor exactly.
        const impactMinor = (BigInt(expense.baseAmountMinor) / BigInt(expense.shares.length + 1)).toString()
        return [{ expense, kind: wholeRoomThen ? 'suggested' : 'optional', impactMinor }]
    })

    return items.length > 0 ? { member, items } : null
}

/** IDs selected on first paint: conservative suggestions only. */
export const suggestedExpenseIds = (review: LatecomerReview): string[] =>
    review.items.filter((item) => item.kind === 'suggested').map((item) => item.expense.id)

/** Exact personal balance impact for the selected equal rows. */
export function selectedImpactMinor(review: LatecomerReview, selectedIds: ReadonlySet<string>): string {
    return review.items
        .filter((item) => selectedIds.has(item.expense.id) && item.impactMinor !== null)
        .reduce((total, item) => total + BigInt(item.impactMinor!), 0n)
        .toString()
}

/** Balances are positive when the room owes the member and negative when the
 * member owes the room. Catch-up adds debt, so it subtracts the reviewed share. */
export function projectedBalanceMinor(currentBalanceMinor: string, addedShareMinor: string): string {
    return (BigInt(currentBalanceMinor) - BigInt(addedShareMinor)).toString()
}

/** Pin every user-editable fact shown by the review. The server compares this
 * snapshot under the room lock before changing only the equal-share rows. */
export function catchUpExpenseInput(
    expense: ApiExpense,
    memberId: string,
    action: CatchUpExpenseInput['action'] = 'add'
): CatchUpExpenseInput {
    return {
        action,
        memberId,
        expectedDescription: expense.description,
        expectedAmountMinor: expense.amountMinor,
        expectedBaseAmountMinor: expense.baseAmountMinor,
        expectedCurrency: expense.currency,
        expectedFxRate: expense.fxRate,
        expectedPaidById: expense.paidById,
        expectedDate: expense.date,
        expectedCategory: expense.category,
        expectedParticipantIds: expense.shares.map((share) => share.memberId),
    }
}

/** What one run of the repair needs to know, and how it talks to the room. */
export interface BackfillRun {
    memberId: string
    /** Pinned when Confirm is pressed: exact reviewed rows, in order. The
     * server compares each snapshot under the room lock before changing it. */
    expenses: readonly ApiExpense[]
    patch: (expense: ApiExpense) => Promise<unknown>
    /** How many writes have actually landed. */
    onWrote: (done: number, expenseId: string, expense: ApiExpense) => void
    /** A pinned row changed enough to become unsafe before its turn. */
    onSkipped?: (expenseId: string) => void
    /** Only known optimistic conflicts may be skipped. Every other failure
     * halts so connectivity/auth/server errors cannot masquerade as review. */
    onPatchError?: (error: unknown, expenseId: string) => 'skip' | 'throw'
    /** "Stop" was pressed. Read between writes, which is the only point in the
     *  run where the room is in a state worth leaving behind. */
    stopped: () => boolean
}

/**
 * The repair itself: one atomic command per expense. Each command carries the
 * snapshot the person actually confirmed. The server owns the authoritative
 * read and returns a review conflict if amount, currency, mode, or participants
 * moved before that command acquired the room lock.
 */
export async function runBackfill(run: BackfillRun): Promise<void> {
    let done = 0
    for (const expense of run.expenses) {
        if (run.stopped()) break
        try {
            await run.patch(expense)
        } catch (error) {
            if (run.onPatchError?.(error, expense.id) === 'skip') {
                run.onSkipped?.(expense.id)
                continue
            }
            throw error
        }
        done += 1
        run.onWrote(done, expense.id, expense)
    }
}

// A review is a local reminder, never a claimed/unclaimed room fact. Remember
// the exact expense set this device reviewed so a later or changed set can be
// offered again without letting one recorder silence the rest of the room.
const REVIEWED_KEY = (slug: string, memberId: string) => `ps:latecomer-reviewed:${slug}:${memberId}`

export const latecomerReviewFingerprint = (
    review: LatecomerReview,
    excludedIds: ReadonlySet<string> = new Set()
): string =>
    JSON.stringify(
        review.items
            .map((item) => item.expense.id)
            .filter((id) => !excludedIds.has(id))
            .sort()
    )

export function isLatecomerReviewDismissed(slug: string, review: LatecomerReview): boolean {
    if (typeof window === 'undefined') return false
    try {
        return window.localStorage.getItem(REVIEWED_KEY(slug, review.member.id)) === latecomerReviewFingerprint(review)
    } catch {
        return false
    }
}

export function dismissLatecomerReview(
    slug: string,
    review: LatecomerReview,
    excludedIds: ReadonlySet<string> = new Set()
): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(
            REVIEWED_KEY(slug, review.member.id),
            latecomerReviewFingerprint(review, excludedIds)
        )
    } catch {
        // A blocked localStorage may repeat a reminder, but never blocks the room.
    }
}
