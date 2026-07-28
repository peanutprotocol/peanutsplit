/**
 * A typed line → one expense draft. The second typing-remover, after the scan.
 *
 * "taxi 12€", "cena 45 pagó Ana", a line pasted straight out of the group chat.
 * The model reads it; this module decides what any of it is allowed to mean.
 * How the request travels is `server/model.ts`, and it is the same wire, the
 * same key and the same capability probe the scan uses — a deployment that can
 * read a bill can read a sentence.
 *
 * Two properties, both worth writing down because both are quietly easy to lose:
 *
 * 1. **The text is never logged and never stored.** It is somebody's group chat.
 *    It arrives in a request body, is forwarded once, and goes out of scope with
 *    the handler. No column, no analytics property, no `console.error` argument
 *    — the failure logs in `server/model.ts` carry a status code and nothing
 *    else, on purpose.
 * 2. **The server never guesses hard.** It matches names against the roster and
 *    it refuses ties: a name that could be two people is no match at all. What
 *    it could not resolve comes back in `unmatchedNames` and the CLIENT decides
 *    — which in practice means the human who typed the sentence decides, on the
 *    ordinary form, with the chips in front of them. A server that picked the
 *    likelier Ana would be right most of the time, and the times it was wrong
 *    would be invisible.
 *
 * And the rule that governs the whole feature: **a parse never creates an
 * expense.** It returns a draft that prefills the reviewed form. One money path.
 */

import { ApiError } from '@/server/http'
import { callModel, coerceCurrency, coerceDate, modelConfig, unfence } from '@/server/model'
import { enforceRateLimitOn, type Limit } from '@/server/rateLimit'
import { modelAmountMinor, nlModelSchema, type NlParseBody } from '@/server/validation'
import { MAX_MEMBERS } from '@/lib/splitwise-csv'

/** One sentence in, one small JSON object out. A thousand is far past any honest
 *  answer and still cheap; the ceiling exists so a model that starts narrating
 *  gets cut off rather than billed for. */
const MAX_ANSWER_TOKENS = 1024

export interface NlDraft {
    /** Null when the text said what it cost but not what for — the form keeps
     *  whatever it already had. */
    description: string | null
    /** Minor units of `currency`, or of the room's currency when that is null. */
    amountMinor: string
    /** ISO-4217, and only if the app supports it. Null → use the room's. */
    currency: string | null
    /** YYYY-MM-DD. */
    date: string | null
    /** A room member id, or null when the text named nobody we could resolve. */
    paidById: string | null
    /** Null means EVERYONE, which is different from an empty list and is why the
     *  field is nullable rather than defaulted here. */
    participantIds: string[] | null
}

export interface NlParseResult {
    draft: NlDraft
    /** Names the text stated that the roster could not resolve — including the
     *  ambiguous ones. The client shows them; nothing is guessed from them. */
    unmatchedNames: string[]
}

export interface NlMember {
    id: string
    name: string
}

/**
 * The prompt. Every rule is one failure mode that would otherwise produce an
 * expense that is wrong in a way nobody notices:
 *
 * - minor units as an integer string, because "12.34" from a model being helpful
 *   about locales is how a taxi costs 1,234;
 * - never invent an amount, because a plausible number in a money field is worse
 *   than an empty one — an empty field is obvious and a wrong one is not;
 * - omit rather than choose between amounts, because "45 for dinner, I put in
 *   20" has two numbers and only one of them is the bill;
 * - names exactly as spelled, because the matching happens here against the real
 *   roster and a model that "corrects" María to Maria has destroyed the only
 *   evidence of who was meant;
 * - a currency only when it is stated, because inferring EUR from a sentence
 *   being in Spanish is how an Argentine room starts pricing dinners in euros;
 * - chat furniture ignored, because the most common input is a pasted line with
 *   a sender name and a timestamp welded to the front of it.
 *
 * `today` is injected rather than left to the model's idea of now, which is
 * whatever its training data made it. It is the only variable part.
 */
export const nlPrompt = (
    today: string
): string => `You are reading one short line of text that a person typed or pasted to record a shared expense. It may be in English, Spanish, Portuguese, or a mix, and it may be pasted out of a group chat with a sender name and a timestamp attached.

Today is ${today}.

Return ONLY a JSON object. No prose, no explanation, no markdown fence. Shape:

{"description":"string","amountMinor":"string","currency":"XXX","date":"YYYY-MM-DD","payerName":"string","participantNames":["string"]}

Rules:
- amountMinor is an INTEGER STRING of the stated currency's MINOR units: 12.34 is "1234". For a currency with no minor unit (JPY, COP) use the whole number: 500 yen is "500".
- NEVER invent an amount. If the text states no amount, omit the field entirely.
- If several amounts appear, use the one that is clearly the total of the expense. If none of them is clearly the total, omit the field rather than choosing.
- description is what the money was for, in the language it was typed in, at most 80 characters. Do not translate it. Do not put the amount, the date or the names in it.
- currency is the ISO-4217 code the text states or symbolises: "12€" is EUR, "R$40" is BRL, "45 pesos" is unstated. Omit the field when the text does not say — never infer a currency from the language the text is written in.
- date resolves relative words against today: "yesterday", "ayer" and "ontem" are the day before ${today}; "today", "hoy" and "hoje" are ${today}. A bare day of the month is the most recent one that has already happened. Omit the field when the text says nothing about when.
- payerName is whoever paid, spelled EXACTLY as the text spells it, accents included. Omit the field unless the text says who paid.
- participantNames are the people the expense is shared between, spelled exactly as the text spells them, and only when the text clearly names them. Omit the field when it does not — omitting it means everyone.
- Ignore chat furniture: a sender name before a colon, a timestamp, an emoji reaction. Read the expense, not the message around it.
- If the text describes no expense at all, return {}.`

/** Every way a parse can fail upstream is one thing to the person who typed the
 *  line. One constructor so two transports cannot drift into saying it
 *  differently, and so the code stays a code. */
const nlFailed = () => new ApiError(502, 'NL_FAILED', 'could not read that text — try again')

/**
 * Fold a name to what two people would call "the same name": no accents, no
 * case, no doubled spaces. `María` and `maria` are one person; the room's roster
 * is already unique case-insensitively, so this only widens that rule by the
 * accents a phone keyboard drops.
 */
const fold = (name: string): string =>
    name
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()

const firstToken = (folded: string): string => folded.split(' ')[0] ?? folded

/**
 * One stated name → one room member, or nothing.
 *
 * Exact (folded) first, so a room holding both "Ana" and "Ana García" resolves
 * "Ana" to Ana rather than calling it ambiguous. Then first names, in both
 * directions: someone typing "Ana" for "Ana García", and someone typing
 * "Ana García" for a member recorded as "Ana".
 *
 * A tie is deliberately NOT broken. Two Anas in a room means the person typing
 * has to tap the right one, which is one tap — where a wrong guess is a balance
 * nobody reconciles until the trip is over.
 */
export function matchMember(stated: string, members: readonly NlMember[]): NlMember | null {
    const wanted = fold(stated)
    if (wanted.length === 0) return null

    const exact = members.filter((member) => fold(member.name) === wanted)
    if (exact.length === 1) return exact[0]
    if (exact.length > 1) return null

    const loose = members.filter((member) => {
        const name = fold(member.name)
        return firstToken(name) === wanted || name === firstToken(wanted)
    })
    return loose.length === 1 ? loose[0] : null
}

/** A description is a label, not a story. The prompt asks for 80 characters;
 *  this is what makes that true when the model narrates instead. */
const coerceDescription = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null
    const description = raw.replace(/\s+/g, ' ').trim().slice(0, 80)
    return description.length > 0 ? description : null
}

/**
 * Model text → a draft the expense form can be filled from. Pure, synchronous,
 * and the only function here worth reading twice: everything the model says is a
 * claim, narrowed one field at a time, and a claim that does not parse is
 * dropped rather than allowed to fail the rest.
 *
 * The one claim that cannot be dropped is the amount. Without it there is
 * nothing to prefill and the form would open exactly as empty as it was, so this
 * throws `NL_NO_AMOUNT` — which is also the honest answer for a line that was
 * never about an expense at all.
 */
export function normalizeNlExpense(rawText: string, ctx: { members: readonly NlMember[] }): NlParseResult {
    let parsed: unknown
    try {
        parsed = JSON.parse(unfence(rawText))
    } catch {
        console.error('[nl] model answer was not JSON')
        throw nlFailed()
    }

    const envelope = nlModelSchema.safeParse(parsed)
    if (!envelope.success) {
        console.error('[nl] model answer did not match the expected shape')
        throw nlFailed()
    }

    const amount = modelAmountMinor.safeParse(envelope.data.amountMinor)
    // Re-stringified through BigInt so "007" and 7 land as the same "7".
    const amountMinor = amount.success ? String(BigInt(amount.data)) : null
    if (amountMinor === null || amountMinor === '0') {
        throw new ApiError(422, 'NL_NO_AMOUNT', 'no amount could be read from that text')
    }

    const unmatchedNames: string[] = []
    /** Records the miss as the person spelled it: the client is going to show it
     *  back to them, and our folded form is not a name anybody typed. */
    const resolve = (stated: string): NlMember | null => {
        const member = matchMember(stated, ctx.members)
        if (!member) unmatchedNames.push(stated.replace(/\s+/g, ' ').trim().slice(0, 80))
        return member
    }

    const payerName = typeof envelope.data.payerName === 'string' ? envelope.data.payerName.trim() : ''
    const payer = payerName.length > 0 ? resolve(payerName) : null

    let participantIds: string[] | null = null
    if (envelope.data.participantNames) {
        const ids = new Set<string>()
        // Bounded by the biggest roster a room can have: past that the model is
        // inventing people, and the work is unbounded for nothing.
        for (const candidate of envelope.data.participantNames.slice(0, MAX_MEMBERS)) {
            if (typeof candidate !== 'string' || candidate.trim().length === 0) continue
            const member = resolve(candidate)
            if (member) ids.add(member.id)
        }
        // Nobody resolved → null, which means everyone. An empty list would mean
        // "split this between no one", which is not a thing anybody typed and
        // which the form could not save anyway.
        participantIds = ids.size > 0 ? [...ids] : null
    }

    return {
        draft: {
            description: coerceDescription(envelope.data.description),
            amountMinor,
            currency: coerceCurrency(envelope.data.currency),
            date: coerceDate(envelope.data.date),
            paidById: payer?.id ?? null,
            participantIds,
        },
        unmatchedNames: [...new Set(unmatchedNames)],
    }
}

/**
 * A room's daily allowance — sixty, against the scan's thirty.
 *
 * Text is cheap: no image tokens, a short answer, and a ceiling that only has to
 * stop a loop rather than price a photo. Same tradeoff as the scan's, stated
 * there in full — a per-container counter that a deploy resets, riding the
 * ordinary token bucket, defending a spend cap on somebody else's API rather
 * than a money invariant.
 */
export const ROOM_NL_LIMIT: Limit = { capacity: 60, windowMs: 24 * 60 * 60 * 1000 }

/** Its own code rather than the generic `RATE_LIMITED`: a spent daily allowance
 *  and "you are going too fast" are different things to say. */
export const enforceRoomNlLimit = (roomId: string): void =>
    enforceRateLimitOn(
        roomId,
        ROOM_NL_LIMIT,
        'nl-room',
        new ApiError(429, 'NL_ROOM_LIMIT', 'this room has used its quick adds for today — try again tomorrow')
    )

/**
 * The whole server side of a quick add: send the line once, keep nothing, and
 * hand back a draft with every unresolved name named rather than guessed.
 *
 * `today` is the caller's, not this module's, so the date rule is testable
 * without mocking a clock.
 */
export async function parseNlExpense(
    body: NlParseBody,
    ctx: { members: readonly NlMember[]; today: string }
): Promise<NlParseResult> {
    const config = modelConfig()
    // The route checks `modelEnabled()` first, so this is the belt to that brace
    // — and the only correct answer for a caller that skipped it.
    if (!config) throw new ApiError(503, 'NL_UNAVAILABLE', 'quick add is not configured')

    const text = await callModel(
        {
            tag: 'nl',
            // The typed line is the whole user message: it goes after the rules
            // and is never interpolated into them, so a sentence containing
            // "Rules:" reads as text rather than as instructions.
            prompt: `${nlPrompt(ctx.today)}\n\nThe text:\n${body.text}`,
            maxOutputTokens: MAX_ANSWER_TOKENS,
            failed: nlFailed,
        },
        config
    )
    return normalizeNlExpense(text, ctx)
}
