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

import type { ApiExpense, ApiMember, ExpenseInput, RoomState } from './api-types'
import { savedExpenses } from './pending'

/** What a banner needs to say, and what a confirm needs to send. */
export interface LatecomerOffer {
    member: ApiMember
    /** Newest first, exactly as the room lists them. Never empty. */
    expenses: ApiExpense[]
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
 * Who to offer the repair for, or null when there is nothing to offer.
 *
 * Derived from the room state rather than handed down from the join, on purpose:
 * the banner is for ANY member, not only the person who just arrived. The people
 * who can best say "yes, Dani was at all of those" are the ones who were already
 * there, and they never see a join event — they see a new face on the balance
 * strip. Deriving it means both audiences get the same offer from the same rule.
 *
 * The newest joiner wins when several qualify. One banner at a time is a decision
 * somebody can actually make; a stack of them is a form.
 */
export function latecomerOffer(state: RoomState | undefined): LatecomerOffer | null {
    if (!state) return null

    const candidates = [...state.members]
        .sort((a, b) =>
            at(a.createdAt) === at(b.createdAt) ? b.id.localeCompare(a.id) : at(b.createdAt) - at(a.createdAt)
        )
        .map((member) => ({ member, expenses: backfillableFor(state, member.id) }))

    return candidates.find((candidate) => candidate.expenses.length > 0) ?? null
}

/**
 * The PATCH body that adds one person to one EQUAL expense.
 *
 * `participantIds` is spelled out rather than omitted, and the difference
 * matters. Omitting it makes the server split across every member in the room —
 * which is a DIFFERENT edit as soon as two people joined late, because it would
 * quietly pull the second one in too. Naming exactly the existing share holders
 * plus this one person is the minimal change, and it is the change the banner
 * described.
 *
 * Everything else is the expense as it stands. The currency is unchanged, so the
 * server keeps the FX rate frozen at creation (see `server/expenses.ts`) and a
 * catch-up cannot re-price a foreign expense.
 */
export function backfillPatch(expense: ApiExpense, memberId: string): ExpenseInput {
    return {
        description: expense.description,
        amountMinor: expense.amountMinor,
        currency: expense.currency,
        paidById: expense.paidById,
        splitMode: 'EQUAL',
        participantIds: [...expense.shares.map((share) => share.memberId), memberId],
        date: expense.date,
        category: expense.category,
    }
}

/** What one run of the repair needs to know, and how it talks to the room. */
export interface BackfillRun {
    memberId: string
    /** Pinned when the button is pressed: which rows this run is about, in order. */
    expenseIds: readonly string[]
    /** The room as it stands RIGHT NOW — the live query cache, not the snapshot
     *  the banner was rendered from. */
    read: () => RoomState | undefined
    patch: (id: string, input: ExpenseInput) => Promise<unknown>
    /** How many writes have actually landed. */
    onWrote: (done: number) => void
    /** "Stop" was pressed. Read between writes, which is the only point in the
     *  run where the room is in a state worth leaving behind. */
    stopped: () => boolean
}

/**
 * The repair itself: one PATCH per expense, each one re-derived from the live
 * room immediately before it is sent.
 *
 * The ids are pinned at the tap; the BODIES deliberately are not. A room refetches
 * every eight seconds and each PATCH is its own round trip, so a run over a dozen
 * expenses spans a dozen windows in which somebody else's edit can land — and a
 * body built from the click-time snapshot would write that edit straight back
 * out: the old amount over their new one, a participant they just added dropped,
 * an EXACT split they just chose rewritten as EQUAL. Re-reading the cache per
 * expense means a landed edit either rides along (a changed amount is carried
 * into the patch verbatim) or disqualifies the row through the same predicate the
 * offer was built from, and it is skipped rather than overwritten.
 *
 * What is left is the single request in flight: an edit that lands after this row
 * was read and before its PATCH is applied. Closing that too needs an
 * optimistic-concurrency token on the expense — a version on the wire, a
 * migration, and a conflict branch in every writer — to protect one row in the
 * rare case where two people edit the same dinner in the same second. Narrowing
 * the race from "the whole run" to "one request" is the part worth paying for.
 */
export async function runBackfill(run: BackfillRun): Promise<void> {
    let done = 0
    for (const id of run.expenseIds) {
        if (run.stopped()) break
        const live = run.read()
        const expense = live ? backfillableFor(live, run.memberId).find((candidate) => candidate.id === id) : undefined
        // Not eligible any more: edited under us, or already fixed by somebody else.
        if (!expense) continue
        await run.patch(id, backfillPatch(expense, run.memberId))
        done += 1
        run.onWrote(done)
    }
}

// ── dismissal ───────────────────────────────────────────────────────────────
// Per room, per person, on this device. Not a server fact: "no, Dani was not on
// that trip" is an answer this phone gave, and asking the rest of the room to
// live with it would make one person's tap everyone's silence.

const DISMISSED_KEY = (slug: string) => `ps:latecomer-dismissed:${slug}`

export const dismissedMemberIds = (slug: string): string[] => {
    if (typeof window === 'undefined') return []
    try {
        const raw = window.localStorage.getItem(DISMISSED_KEY(slug))
        const parsed: unknown = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
    } catch {
        // A full or blocked localStorage must not cost somebody the room.
        return []
    }
}

export function dismiss(slug: string, memberId: string): void {
    if (typeof window === 'undefined') return
    try {
        const next = [...new Set([...dismissedMemberIds(slug), memberId])]
        window.localStorage.setItem(DISMISSED_KEY(slug), JSON.stringify(next))
    } catch {
        // Same again: a banner that will not go away is annoying, a room that
        // will not render is broken.
    }
}
