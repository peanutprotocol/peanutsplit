/**
 * Bill photo → line items. What a scan MEANS; how it travels is `server/model.ts`.
 *
 * Two properties this module exists to hold, both of them the kind that quietly
 * stop being true if nobody writes them down. (The third — that nothing sent is
 * persisted and nothing sent reaches a log — is the transport's, and is stated
 * in its header.)
 *
 * 1. **The image is never persisted.** It arrives in a request body, is
 *    forwarded once, and goes out of scope with the handler. There is no column,
 *    no bucket, no temp file. A photograph of a receipt carries a card's last
 *    four, a table number, a date and a place — it is the most identifying thing
 *    anyone will ever hand this app, and the only safe amount to keep is none.
 * 2. **The model's arithmetic is never trusted.** It reads; we count. Item
 *    amounts go through the same `minorAmount` primitive as every other amount
 *    on this surface, the sum is recomputed here, and the total the model claims
 *    it read is kept *beside* our sum rather than instead of it, so a
 *    disagreement can be shown to the user instead of silently resolved.
 *
 * What the transports do NOT get to differ on is everything that decides what a
 * scan means: `PROMPT` goes out verbatim over whichever wire is configured, and
 * both answers land in the same `normalizeReceipt`. A transport with its own
 * prompt or its own parsing would be a second scan feature wearing this one's
 * name, and the day they drifted is the day the same photo started producing two
 * different splits.
 */

import { ApiError } from '@/server/http'
import { callModel, coerceCurrency, coerceDate, modelConfig, unfence } from '@/server/model'
import { enforceRateLimitOn, type Limit } from '@/server/rateLimit'
import { receiptItemSchema, receiptModelSchema, type ReceiptParseBody } from '@/server/validation'

/** 8MB of actual image bytes. A downscaled phone photo lands around 200-500KB;
 *  this ceiling exists for the person who picks a raw file out of their gallery,
 *  not for the normal path. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
/** Base64 is 4 bytes per 3, so the encoded form of the ceiling is this. Checked
 *  before decoding — the point of a size limit is to not do the work. */
export const MAX_IMAGE_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4

/** More lines than any real bill, and the ceiling on how much work one photo can
 *  make for the review screen. */
export const MAX_ITEMS = 60

/** Generous: a long bill is a long answer, and a truncated one is unparseable
 *  JSON — a cheap ceiling here costs the whole scan. */
const MAX_ANSWER_TOKENS = 4096

export interface ReceiptItem {
    label: string
    /** Minor units of `currency` (or of the room's currency when we could not
     *  tell), as a decimal string. Never a number — see `lib/money`. */
    amountMinor: string
    quantity: number | null
}

export interface ParsedReceipt {
    items: ReceiptItem[]
    /**
     * OUR sum of `items`, recomputed here. This is the number that prefills the
     * expense amount, because an EXACT split is only valid when the shares add
     * up to it — so it has to be the sum of the things being shared, not a
     * number read off a photograph.
     */
    suggestedTotalMinor: string
    /**
     * The grand total printed on the receipt, when the model read one that
     * parsed. Null otherwise. Deliberately NOT reconciled with
     * `suggestedTotalMinor`: when they disagree the review screen says so, and
     * the person holding the receipt decides which one is wrong.
     */
    receiptTotalMinor: string | null
    /** ISO-4217, and only if it is a currency this app supports. */
    currency: string | null
    merchant: string | null
    /** YYYY-MM-DD. */
    date: string | null
}

/**
 * The prompt. Every rule here is one shape of receipt that would otherwise
 * produce a split that is wrong in a way nobody notices:
 *
 * - minor units as an integer string, because "12.34" from a model that decided
 *   to be helpful about locales is how a bill becomes 1,234;
 * - the LINE total, not the unit price, because "3 × beer 4.00" is 12.00 owed;
 * - tax and service as their own items, because the table owes them too and
 *   dropping them makes every scan under-collect;
 * - no subtotals and no discounts, because a subtotal double-counts and a
 *   negative line has no representation in a schema that refuses negatives.
 *
 * The JSON-mode switch each transport sets — `responseMimeType` on Gemini,
 * `response_format` on OpenRouter — is what actually stops the markdown fence;
 * the "no prose" sentence is belt to its braces.
 *
 * Sent verbatim by both transports. Change it here or nowhere: a prompt that
 * lived next to one wire would drift the moment the other one was edited.
 */
const PROMPT = `You are reading a photograph of a receipt or a bill.

Return ONLY a JSON object. No prose, no explanation, no markdown fence. Shape:

{"items":[{"label":"string","amountMinor":"string","quantity":1}],"total":{"amountMinor":"string"},"currency":"XXX","merchant":"string","date":"YYYY-MM-DD"}

Rules:
- amountMinor is an INTEGER STRING of the currency's MINOR units: 12.34 is "1234". For a currency with no minor unit (JPY, COP) use the whole number: 500 yen is "500".
- One entry per printed line item. amountMinor is the LINE TOTAL for that row (unit price x quantity), never the unit price.
- label is the printed name, trimmed, at most 80 characters, in the language printed on the receipt. Do not translate it.
- quantity is the printed quantity, or 1 when none is printed.
- Include tax, service charge and tip as their own items, labelled as printed — the table owes those too.
- Do NOT include subtotal lines, discounts, loyalty deductions, change, or payment-method lines.
- total is the grand total printed on the receipt. Omit the field entirely if no total is printed.
- currency is the ISO-4217 code you infer from the symbols or text. Omit if you cannot tell.
- merchant is the business name. date is the receipt date as YYYY-MM-DD. Omit either if not printed.
- If the image is not a receipt or you can read no line items, return {"items":[]}.`

/** Every way a scan can fail upstream is one thing to the person holding the
 *  phone. One constructor so two transports cannot drift into saying it
 *  differently, and so the code stays a code. */
const scanFailed = () => new ApiError(502, 'SCAN_FAILED', 'could not read the bill — try again')

/** `{ amountMinor }`, a bare string, a number — models produce all three for a
 *  total. Anything else, including a negative, is simply absent. */
function coerceTotal(raw: unknown): string | null {
    const value =
        raw && typeof raw === 'object' && 'amountMinor' in raw ? (raw as { amountMinor: unknown }).amountMinor : raw
    if (typeof value !== 'string' && typeof value !== 'number') return null
    const text = String(value).trim()
    if (!/^\d{1,12}$/.test(text)) return null
    return String(BigInt(text))
}

const coerceMerchant = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null
    // Newlines collapse: the model sometimes returns the whole address block.
    const merchant = raw.replace(/\s+/g, ' ').trim().slice(0, 80)
    return merchant.length > 0 ? merchant : null
}

/**
 * Model text → something a split can be built from. Pure, synchronous, and the
 * only function in this module worth reading twice: everything the model says is
 * treated as a claim, one item at a time, and a claim that does not parse is
 * dropped rather than allowed to fail the batch.
 *
 * Throws `SCAN_NO_ITEMS` when nothing survives — a photo of a lamppost and a
 * receipt the model could not read are the same outcome for the person holding
 * the phone, and both deserve "try again" rather than an empty review screen.
 */
export function normalizeReceipt(rawText: string, roomCurrency: string): ParsedReceipt {
    let parsed: unknown
    try {
        parsed = JSON.parse(unfence(rawText))
    } catch {
        console.error('[scan] model answer was not JSON')
        throw scanFailed()
    }

    const envelope = receiptModelSchema.safeParse(parsed)
    if (!envelope.success) {
        console.error('[scan] model answer did not match the expected shape')
        throw scanFailed()
    }

    const items: ReceiptItem[] = []
    for (const candidate of envelope.data.items ?? []) {
        if (items.length >= MAX_ITEMS) break
        const item = receiptItemSchema.safeParse(candidate)
        if (!item.success) continue
        items.push({
            label: item.data.label,
            // Re-stringified through BigInt so "007" and 7 land as the same "7".
            amountMinor: String(BigInt(item.data.amountMinor)),
            quantity: item.data.quantity ?? null,
        })
    }

    if (items.length === 0) throw new ApiError(422, 'SCAN_NO_ITEMS', 'no line items found on that image')

    return {
        items,
        suggestedTotalMinor: items.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n).toString(),
        receiptTotalMinor: coerceTotal(envelope.data.total),
        currency: coerceCurrency(envelope.data.currency, roomCurrency),
        merchant: coerceMerchant(envelope.data.merchant),
        date: coerceDate(envelope.data.date),
    }
}

/**
 * A room's daily allowance.
 *
 * The tradeoff, stated so the next person does not have to guess: this is a
 * per-container counter that a deploy resets and two containers double. A DB
 * table would be the honest one — but the thing being defended here is a spend
 * ceiling on somebody else's API, not a money invariant, and the per-IP limiter
 * in `rateLimit.ts` already carries the abuse case. A migration on a schema this
 * feature does not otherwise touch is the wrong price for tightening a number
 * that only has to be roughly right. Revisit if the bill ever shows up.
 *
 * "Roughly right" is also why this rides the ordinary token bucket rather than a
 * hand-rolled fixed window: thirty tokens that trickle back over a day, sharing
 * one map, one prune and one key ceiling with every other limiter in the
 * process.
 */
export const ROOM_SCAN_LIMIT: Limit = { capacity: 30, windowMs: 24 * 60 * 60 * 1000 }

/** Its own code rather than the generic `RATE_LIMITED`: a spent daily allowance
 *  and "you are going too fast" are different things to say to someone holding a
 *  bill and a phone. */
export const enforceRoomScanLimit = (roomId: string): void =>
    enforceRateLimitOn(
        roomId,
        ROOM_SCAN_LIMIT,
        'scan-room',
        new ApiError(429, 'SCAN_ROOM_LIMIT', 'this room has scanned a lot of bills today — try again tomorrow')
    )

/** The whole server side of a scan: send the image once, keep nothing, and hand
 *  back numbers we counted ourselves. */
export async function parseReceipt(body: ReceiptParseBody, roomCurrency: string): Promise<ParsedReceipt> {
    const config = modelConfig()
    // The route checks `modelEnabled()` first, so this is the belt to that brace
    // — and the only correct answer for a caller that skipped it.
    if (!config) throw new ApiError(503, 'SCAN_UNAVAILABLE', 'receipt scanning is not configured')

    const text = await callModel(
        {
            tag: 'scan',
            prompt: PROMPT,
            image: { base64: body.imageBase64, mimeType: body.mimeType },
            maxOutputTokens: MAX_ANSWER_TOKENS,
            failed: scanFailed,
        },
        config
    )
    return normalizeReceipt(text, roomCurrency)
}
