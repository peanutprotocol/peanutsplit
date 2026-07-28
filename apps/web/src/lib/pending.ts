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
 */
import type { ApiExpense, RoomState } from './api-types'

/** The prefix every not-yet-saved row wears. Minted by `draftExpenseRow`. */
export const PENDING_ID_PREFIX = 'pending-'

export const isPendingExpenseId = (expenseId: string): boolean => expenseId.startsWith(PENDING_ID_PREFIX)

/** The expenses the server actually holds — the merged list minus the drafts. */
export const savedExpenses = (expenses: readonly ApiExpense[]): ApiExpense[] =>
    expenses.filter((expense) => !isPendingExpenseId(expense.id))

/**
 * Square, and with something to have been square about.
 *
 * `suggestedTransfers` is server truth, so the count it is weighed against has
 * to be server truth too. An empty room is not settled, it is empty — and a room
 * whose only row has not been sent yet is still empty.
 */
export const isRoomSettled = (state: RoomState | undefined): boolean =>
    !!state && savedExpenses(state.expenses).length > 0 && state.suggestedTransfers.length === 0
