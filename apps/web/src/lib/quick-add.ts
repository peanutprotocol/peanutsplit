/**
 * Quick add's whole model: a parsed draft becomes form values, and nothing else.
 *
 * Pure on purpose, and tiny on purpose. Quick add has no screens of its own to
 * hold state for — it is one textarea and one button — so the only thing worth
 * testing without React is the handoff, which is where a wrong number would
 * come from.
 *
 * THE handoff rule, the same one the scan flow follows: a parse never creates an
 * expense. It produces `ExpenseFormValues` and stops, and the user saves through
 * the same button, the same validation and the same POST as a hand-typed
 * expense. One money path, already tested — a "save what you typed" endpoint
 * would be a second way to write shares into a room, with its own FX handling
 * and its own rounding, for the sake of skipping the screen that lets someone
 * check what the model heard.
 *
 * Every field the server could not fill comes back null, and null means "keep
 * what the form already had". That is why this is a merge and not a
 * replacement: the payer someone picked before typing, the room's currency, and
 * "split with everyone" all survive a draft that says nothing about them.
 */

import type { CurrencyInfo } from './api-types'
import { fromDateInputValue } from './dates'
import type { ExpenseFormValues } from './expense-form'
import { decimalsOf, formatMinorPlain } from './money'

/**
 * Five hundred characters is a long WhatsApp line and a short paragraph. The
 * ceiling is here rather than in the route because the textarea and the server
 * have to agree about it, and two numbers that must agree should be one number
 * (the same reason the Splitwise import imports its caps).
 */
export const MAX_NL_TEXT_CHARS = 500

/** What the server read, with every field it could not fill left null. Mirrors
 *  `NlDraft` in `api-types.ts` — this module takes the wire shape as given. */
export interface NlDraft {
    description: string | null
    /** Minor units of `currency`, or of the room's when that is null. */
    amountMinor: string
    currency: string | null
    /** YYYY-MM-DD. */
    date: string | null
    paidById: string | null
    /** Null means everyone — see `participantsTouched` below. */
    participantIds: string[] | null
}

/**
 * Draft + the form as it stands → the form as it should stand.
 *
 * Two decisions worth defending:
 *
 * - **The split mode is EQUAL, always.** A sentence names people or it doesn't;
 *   it never says who owes how much. Landing in EXACT with the amounts guessed
 *   would be the model dividing money, which is the one thing it is not allowed
 *   to do. (This is the mirror of the scan flow, which always lands in EXACT
 *   because a receipt IS a list of who owes what.)
 * - **A null participant list leaves `participantsTouched` false**, so the body
 *   omits `participantIds` and the SERVER splits among everyone at save time.
 *   "Everyone" is intent, not a member-list snapshot — a friend who joined the
 *   room three seconds ago must not be silently left out of the round.
 */
export function draftToFormValues(
    draft: NlDraft,
    opts: { base: ExpenseFormValues; roomCurrency: string; currencies?: readonly CurrencyInfo[] }
): ExpenseFormValues {
    const currency = draft.currency ?? opts.roomCurrency
    const decimals = decimalsOf(currency, opts.currencies)

    return {
        ...opts.base,
        description: draft.description ?? opts.base.description,
        amountInput: formatMinorPlain(draft.amountMinor, decimals),
        currency,
        paidById: draft.paidById ?? opts.base.paidById,
        splitMode: 'EQUAL',
        participantIds: draft.participantIds ?? opts.base.participantIds,
        participantsTouched: draft.participantIds !== null,
        // An EXACT allocation left over from before the parse describes a
        // different total and different people; carrying it forward would leave
        // the form unsaveable for a reason nothing on screen explains.
        exactInputs: {},
        percentageInputs: {},
        shareInputs: {},
        // The stated day when there was one, keeping the time of day from the
        // form's current value so same-day ordering survives.
        date: draft.date ? fromDateInputValue(draft.date, opts.base.date) : opts.base.date,
    }
}
