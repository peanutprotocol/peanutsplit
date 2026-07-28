/**
 * What counts as a real expense, and what is only a drawing of one.
 *
 * Two paths put rows into a RoomState that the server has never seen: the
 * optimistic add, in flight, and the offline queue, waiting for signal. Both
 * wear the `pending-` prefix, and the merged state a screen actually renders
 * contains them mixed in with the real ones.
 *
 * That mixture is safe for anything that only draws, and dangerous for anything
 * that CONCLUDES. `state.expenses.length > 0` next to a server-computed
 * `suggestedTransfers.length === 0` is a sentence with one half from each world
 * — and it read as "all settled" for a brand-new room holding a single queued
 * expense, complete with confetti, the sound cue and a share card saying
 * "€0.00 · 0 expenses". The rule this module exists to make cheap: derive from
 * `savedExpenses`, never from the merged list.
 *
 * The same reasoning has a second half, learned later and from the other end.
 * `suggestedTransfers.length === 0` is not a fact about settling at all — it is
 * a fact about the CURRENT balances, and it is equally true of a room where
 * every debt was cleared, a room with one person in it, and a room where nobody
 * ever owed anybody. Only the first is worth confetti. So a conclusion needs a
 * cause as well as a count: something must have been owed before "nothing is
 * owed" means anything.
 */
import type { ApiExpense, RoomState } from './api-types'

/** The prefix every not-yet-saved row wears. Minted by `draftExpenseRow`. */
export const PENDING_ID_PREFIX = 'pending-'

export const isPendingExpenseId = (expenseId: string): boolean => expenseId.startsWith(PENDING_ID_PREFIX)

/** The expenses the server actually holds — the merged list minus the drafts. */
export const savedExpenses = (expenses: readonly ApiExpense[]): ApiExpense[] =>
    expenses.filter((expense) => !isPendingExpenseId(expense.id))

/**
 * Did this expense put money between two people?
 *
 * A share that belongs to somebody other than the payer is the whole definition
 * of a debt: one person's money left, another person's obligation arrived. An
 * expense whose only share is the payer's own is a note to self — real spending,
 * no debt, and nothing that could ever have been settled.
 *
 * Written as "a share that isn't the payer's" rather than "more than one share"
 * because the two are not the same claim. Two shares always include somebody who
 * did not pay, so this is the weaker test in that direction — but a SINGLE share
 * sitting on somebody else (the shape the Splitwise importer writes for a
 * brought-forward balance, and the shape "I covered your ticket" takes) is a
 * cross-person debt that a share COUNT would have called private spending.
 */
const isCrossPersonDebt = (expense: ApiExpense): boolean =>
    expense.shares.some((share) => share.memberId !== expense.paidById)

/**
 * Square, and with something to have been square about.
 *
 * `suggestedTransfers` is server truth, so the count it is weighed against has
 * to be server truth too. An empty room is not settled, it is empty — and a room
 * whose only row has not been sent yet is still empty.
 *
 * Two further conditions, both bought with the same lesson the pending rule was:
 * an empty `suggestedTransfers` is not evidence of anything on its own, because
 * it is ALSO what a room that never had a debt looks like.
 *
 *  - **One member.** An organiser alone in a fresh room has no second party to
 *    owe or be owed by. Their balance is zero the way an empty ledger is zero.
 *  - **No cross-person expense.** Somebody logging what they spent on themselves
 *    produces real rows, real totals, and zero debts.
 *
 * Both used to reach the full celebration — confetti, the bell, the `all_settled`
 * event and a share card — for people who had settled nothing. Being congratulated
 * for a debt you never had does not read as a bug in the maths, it reads as the
 * app not having understood what happened, which is the more expensive failure.
 */
export const isRoomSettled = (state: RoomState | undefined): boolean => {
    if (!state) return false
    if (state.members.length < 2) return false
    if (!savedExpenses(state.expenses).some(isCrossPersonDebt)) return false
    return state.suggestedTransfers.length === 0
}
