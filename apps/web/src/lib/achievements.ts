/**
 * What this room has earned, derived from what it already holds.
 *
 * Pure, client-side, and deliberately tableless: every fact an achievement needs is already on the
 * wire in `RoomState`. Split is accountless, so the server has no notion of "who is looking" — a
 * server-side "celebrate" would have to be per-device anyway, and per-device is what this is.
 *
 * Two rules the whole module obeys:
 *
 *  - **Never conclude from the merged list.** `savedExpenses` only, never `state.expenses`. An
 *    unsent row once produced confetti and a card reading "€0.00 · 0 expenses" — `lib/pending.ts`
 *    is the write-up.
 *  - **Never read money.** No `balances`, no `suggestedTransfers`, no `amountMinor`, no
 *    `baseAmountMinor`, no `fxRate`, no share or settlement amount. The awards are about
 *    contribution and coordination; a rule that reached for a balance would be the debtor ranking
 *    the roadmap bans. `achievements.test.ts` hands this module a state whose every monetary field
 *    throws on access, so the rule is mechanical rather than a code-review promise.
 *
 * Determinism matters more here than it looks: these outputs get screenshotted and pasted into a
 * group chat, so two phones must agree. Ties break on `member.id` in code-unit order, never
 * `localeCompare` — ICU collation varies by container build (`server/og/recapCard.ts` learned this
 * the same way).
 */
import type { ApiExpense, RoomState } from './api-types'
import { AWARD_IDS, CREW_THRESHOLDS, PASSPORT_THRESHOLDS } from './achievements-contract'
import type { AchievementType, AwardId } from './achievements-contract'
import { FALLBACK_AVATAR_KEY } from './avatars'
import { savedExpenses } from './pending'
import { isRoomSettled } from './pending'

export interface Unlock {
    type: AchievementType
    /** Stable id for the seen-set: 'crew-5', 'passport-3', 'alterego', 'wrapped'. */
    id: string
    /**
     * Every id this unlock consumes, including its own.
     *
     * A device that first opens a room already twelve people strong gets ONE moment, not four —
     * so crossing a threshold retires every lower threshold at the same time. Without this the
     * caller would have to re-derive the threshold list to know what to mark.
     */
    covers: readonly string[]
    /** What the moment draws. Never a name, never an amount. */
    detail: { count?: number; award?: AwardId; persona?: string; palette?: string | null }
}

/** Highest crossed threshold, plus everything below it. Null when none is crossed. */
const crossed = (value: number, thresholds: readonly number[]): { top: number; all: number[] } | null => {
    const all = thresholds.filter((threshold) => value >= threshold)
    if (all.length === 0) return null
    return { top: all[all.length - 1], all }
}

/** The roster moment. Not every join — only 3, 5, 8 and 12, and only the highest one crossed. */
export function crewUnlock(state: RoomState): Unlock | null {
    const count = state.members.length
    const hit = crossed(count, CREW_THRESHOLDS)
    if (!hit) return null
    return {
        type: 'crew',
        id: `crew-${hit.top}`,
        covers: hit.all.map((threshold) => `crew-${threshold}`),
        detail: { count },
    }
}

/** Distinct EXPENSE currencies — not the room currency. A room that settles in EUR with
 *  EUR-only expenses has one currency, correctly. */
export function passportUnlock(state: RoomState): Unlock | null {
    const currencies = new Set(savedExpenses(state.expenses).map((expense) => expense.currency))
    const hit = crossed(currencies.size, PASSPORT_THRESHOLDS)
    if (!hit) return null
    return {
        type: 'passport',
        id: `passport-${hit.top}`,
        covers: hit.all.map((threshold) => `passport-${threshold}`),
        detail: { count: currencies.size },
    }
}

/** Ascending by the same key the ledger sorts on, so "first" means the same thing on every phone. */
const earliestFirst = (a: ApiExpense, b: ApiExpense): number =>
    a.date !== b.date
        ? a.date < b.date
            ? -1
            : 1
        : a.createdAt !== b.createdAt
          ? a.createdAt < b.createdAt
              ? -1
              : 1
          : a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0

/** One award's score per member, and the score a member must reach to receive it. */
interface AwardRule {
    minimum: number
    score: (state: RoomState, expenses: readonly ApiExpense[]) => Map<string, number>
}

const countBy = (ids: readonly (string | null)[]): Map<string, number> => {
    const counts = new Map<string, number>()
    for (const id of ids) {
        if (id === null) continue
        counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
}

/**
 * The six rules. `createdById` is nullable — imported rooms carry nulls throughout — so a pure
 * Splitwise import can legitimately award only `tripStarter`. Nulls are skipped, never crashed on.
 */
const RULES: Record<AwardId, AwardRule> = {
    /** `members` is `createdAt asc` (`server/roomState.ts`), so the head of the roster is the creator. */
    tripStarter: {
        minimum: 1,
        score: (state) => (state.members[0] ? new Map([[state.members[0].id, 1]]) : new Map()),
    },
    firstMover: {
        minimum: 1,
        score: (_state, expenses) => {
            const first = [...expenses].sort(earliestFirst)[0]
            return first?.createdById ? new Map([[first.createdById, 1]]) : new Map()
        },
    },
    /** Expenses WRITTEN, not paid — bookkeeping, not spending. */
    ledgerLegend: {
        minimum: 2,
        score: (_state, expenses) => countBy(expenses.map((expense) => expense.createdById)),
    },
    currencyHopper: {
        minimum: 2,
        score: (_state, expenses) => {
            const seen = new Map<string, Set<string>>()
            for (const expense of expenses) {
                if (!expense.createdById) continue
                const codes = seen.get(expense.createdById) ?? new Set<string>()
                codes.add(expense.currency)
                seen.set(expense.createdById, codes)
            }
            return new Map([...seen].map(([memberId, codes]) => [memberId, codes.size]))
        },
    },
    /** Who did the admin of closing the book — never who paid fastest. */
    theCloser: {
        minimum: 1,
        score: (state) => countBy(state.settlements.map((settlement) => settlement.createdById)),
    },
    hypeCrew: {
        minimum: 1,
        score: (_state, expenses) =>
            countBy(expenses.flatMap((expense) => expense.reactions.map((reaction) => reaction.memberId))),
    },
}

/**
 * One positive role per member per trip, or none.
 *
 * Iterate the six in a fixed order; each goes to the highest-scoring member who has not been
 * awarded yet, **and only if that member's own score meets the minimum**. The minimum is a fact
 * about the candidate, never about the room — otherwise the second-place member of a two-person
 * room where one person did everything gets handed "First Mover" for having done nothing, which is
 * a personal, shareable, false claim about a named human.
 *
 * So a room can legitimately hand out fewer than six awards, and frequently does.
 */
export function awardsFor(state: RoomState): Record<string, AwardId> {
    const expenses = savedExpenses(state.expenses)
    const roster = new Set(state.members.map((member) => member.id))
    const awarded: Record<string, AwardId> = {}

    for (const award of AWARD_IDS) {
        const rule = RULES[award]
        const scores = rule.score(state, expenses)
        let winner: string | null = null
        let best = 0
        for (const [memberId, score] of scores) {
            if (!roster.has(memberId) || memberId in awarded) continue
            // Code-unit order, not localeCompare: two phones must agree.
            if (score > best || (score === best && winner !== null && memberId < winner)) {
                winner = memberId
                best = score
            }
        }
        if (winner !== null && best >= rule.minimum) awarded[winner] = award
    }

    return awarded
}

/**
 * Everything this room currently satisfies, for this device.
 *
 * Unfiltered by history on purpose — the caller owns the seen-set (`achievement-storage.ts`) and
 * uses `covers` to retire the lower rungs. `wrapped` is returned but has no in-room moment: its
 * surface is the deck on the recap page, and the existing all-settled celebration is already the
 * moment for that event.
 */
export function unlocksFor(state: RoomState, meId: string | undefined): Unlock[] {
    const unlocks: Unlock[] = []

    const crew = crewUnlock(state)
    if (crew) unlocks.push(crew)

    const passport = passportUnlock(state)
    if (passport) unlocks.push(passport)

    // An award handed out mid-trip would change under its recipient, so both of these wait for the
    // book to close.
    if (isRoomSettled(state)) {
        if (meId) {
            const award = awardsFor(state)[meId]
            if (award) {
                const me = state.members.find((member) => member.id === meId)
                unlocks.push({
                    type: 'alterego',
                    id: 'alterego',
                    covers: ['alterego'],
                    detail: {
                        award,
                        persona: me?.avatar ?? FALLBACK_AVATAR_KEY,
                        palette: me?.avatarPalette ?? null,
                    },
                })
            }
        }
        unlocks.push({ type: 'wrapped', id: 'wrapped', covers: ['wrapped'], detail: {} })
    }

    return unlocks
}
