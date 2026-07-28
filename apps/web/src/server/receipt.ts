/**
 * Bill photo → line items. The one place Split talks to a vision model.
 *
 * Three properties this module exists to hold, all of them the kind that quietly
 * stop being true if nobody writes them down:
 *
 * 1. **The image is never persisted.** It arrives in a request body, is
 *    forwarded once, and goes out of scope with the handler. There is no column,
 *    no bucket, no temp file. A photograph of a receipt carries a card's last
 *    four, a table number, a date and a place — it is the most identifying thing
 *    anyone will ever hand this app, and the only safe amount to keep is none.
 * 2. **Receipt content never reaches a log.** No labels, no amounts, no merchant,
 *    not in an error path either. Every `console.error` below carries a status
 *    code — and, on OpenRouter, the machine-readable error code beside it — and
 *    nothing else. Never `error.message`: a provider is free to quote the
 *    request back at you in it. If you are debugging this in production and
 *    wishing for the payload, that wish is the feature working.
 * 3. **The model's arithmetic is never trusted.** It reads; we count. Item
 *    amounts go through the same `minorAmount` primitive as every other amount
 *    on this surface, the sum is recomputed here, and the total the model claims
 *    it read is kept *beside* our sum rather than instead of it, so a
 *    disagreement can be shown to the user instead of silently resolved.
 *
 * Two interchangeable transports carry the image out, picked by which key is
 * set. Same shape as `server/email.ts` and for the same reason: one function
 * decides, and nothing downstream is allowed to know which wire it got.
 *
 * - **OpenRouter** (`SPLIT_OPENROUTER_API_KEY`) — preferred. It fronts the same
 *   Gemini weights alongside every other vision model behind one bill and one
 *   per-key spend cap, so "the cheapest model that can read a bill" becomes an
 *   env change rather than a second integration to write and keep alive.
 * - **Gemini direct** (`SPLIT_GEMINI_API_KEY`) — the original path, kept as the
 *   fallback so a key we already hold stays sufficient on its own.
 *
 * Neither key is a first-class state: the capability probe says
 * `enabled: false`, the UI hides the affordance, and a POST that arrives anyway
 * answers 503 `SCAN_UNAVAILABLE`. Nothing half-works.
 *
 * What the transports do NOT get to differ on is everything that decides what a
 * scan means: both send `PROMPT` verbatim, and both hand their answer to the
 * same `normalizeReceipt`. A transport with its own prompt or its own parsing
 * would be a second scan feature wearing this one's name, and the day they
 * drifted is the day the same photo started producing two different splits.
 */

import { ApiError } from '@/server/http'
import { CURRENCY_CODES } from '@/server/money'
import { enforceRateLimitOn, type Limit } from '@/server/rateLimit'
import { receiptItemSchema, receiptModelSchema, type ReceiptParseBody } from '@/server/validation'

/**
 * Flash-Lite is the cheapest vision-capable model in the 2.5 family, and reading
 * printed text off a photo is the task it is least likely to be the wrong choice
 * for. Overridable because "cheapest current" is a fact with a shelf life, and a
 * model swap should not need a deploy of new code.
 */
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'
/** The same weights, spelled the way OpenRouter's catalog addresses them. Two
 *  constants rather than one because the two APIs do not share a namespace —
 *  `gemini-2.5-flash-lite` is a 404 on OpenRouter and vice versa. */
const DEFAULT_OPENROUTER_MODEL = 'google/gemini-2.5-flash-lite'
const GEMINI_HOST = 'https://generativelanguage.googleapis.com'
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

/** 8MB of actual image bytes. A downscaled phone photo lands around 200-500KB;
 *  this ceiling exists for the person who picks a raw file out of their gallery,
 *  not for the normal path. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
/** Base64 is 4 bytes per 3, so the encoded form of the ceiling is this. Checked
 *  before decoding — the point of a size limit is to not do the work. */
export const MAX_IMAGE_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4

/** The model gets one shot and a hard stop. A phone on hotel wifi has already
 *  given up by 25s, and a hung request holds a serverless invocation open. */
const REQUEST_TIMEOUT_MS = 25_000

/** More lines than any real bill, and the ceiling on how much work one photo can
 *  make for the review screen. */
export const MAX_ITEMS = 60

type ScanConfig =
    { transport: 'openrouter'; apiKey: string; model: string } | { transport: 'gemini'; apiKey: string; model: string }

/**
 * The one place a transport is chosen. Read per call, never at import: env
 * arrives after the module graph in some runtimes, and a module-level snapshot
 * would cache "unconfigured" forever — the same reason `emailConfig()` is a
 * function.
 */
function scanConfig(): ScanConfig | null {
    const openRouterKey = process.env.SPLIT_OPENROUTER_API_KEY
    if (openRouterKey) {
        return {
            transport: 'openrouter',
            apiKey: openRouterKey,
            model: process.env.SPLIT_SCAN_MODEL || DEFAULT_OPENROUTER_MODEL,
        }
    }
    const geminiKey = process.env.SPLIT_GEMINI_API_KEY
    if (geminiKey) {
        return { transport: 'gemini', apiKey: geminiKey, model: process.env.SPLIT_GEMINI_MODEL || DEFAULT_GEMINI_MODEL }
    }
    return null
}

/** Either key is enough. The probe answers for the feature, not for a provider —
 *  swapping transports must never make the button flicker out of existence. */
export const scanEnabled = (): boolean => scanConfig() !== null

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

/**
 * Undici's `ProxyAgent` is the only route out of a container with no egress, and
 * it is imported lazily so the direct path never pulls it in. Same pattern and
 * the same reasoning as `server/email.ts` — see the deploy notes in the root
 * README on why the network is pinned rather than opened.
 */
async function proxyDispatcher(): Promise<unknown | null> {
    const proxyUrl = process.env.SPLIT_SCAN_PROXY_URL
    if (!proxyUrl) return null
    try {
        const { ProxyAgent } = await import('undici')
        return new ProxyAgent(proxyUrl)
    } catch (err) {
        // Name only, like every other log in this module. Undici puts the URL it
        // was constructed with on its errors, and a proxy URL is allowed to
        // carry credentials — see property 2 in the file header.
        console.error('[scan] proxy unavailable', err instanceof Error ? err.name : 'unknown')
        return null
    }
}

/** Every way a scan can fail upstream is one thing to the person holding the
 *  phone. One constructor so two transports cannot drift into saying it
 *  differently, and so the code stays a code. */
const scanFailed = () => new ApiError(502, 'SCAN_FAILED', 'could not read the bill — try again')

/** The model's raw answer, as text. Everything about whether it is *usable*
 *  belongs to `normalizeReceipt` — these functions only know about HTTP. */
async function callGemini(body: ReceiptParseBody, config: ScanConfig): Promise<string> {
    const dispatcher = await proxyDispatcher()

    let response: Response
    try {
        response = await fetch(`${GEMINI_HOST}/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: PROMPT },
                            { inline_data: { mime_type: body.mimeType, data: body.imageBase64 } },
                        ],
                    },
                ],
                generationConfig: {
                    // Zero temperature because this is transcription, not writing:
                    // the same photo should produce the same split twice.
                    temperature: 0,
                    responseMimeType: 'application/json',
                    maxOutputTokens: 8192,
                },
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            // `dispatcher` is undici's, not the fetch standard's — same cast, and
            // the same price, as the email transport pays.
            ...(dispatcher ? ({ dispatcher } as Record<string, unknown>) : {}),
        })
    } catch (err) {
        // Status only. The request body is a photograph of somebody's dinner.
        console.error('[scan] model request failed', err instanceof Error ? err.name : 'unknown')
        throw scanFailed()
    }

    if (!response.ok) {
        console.error(`[scan] model rejected the request (${response.status})`)
        throw scanFailed()
    }

    const payload = (await response.json().catch(() => null)) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
    } | null

    const text = (payload?.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('')
        .trim()

    if (!text) {
        console.error('[scan] model returned an empty candidate')
        throw scanFailed()
    }
    return text
}

/**
 * The same request over OpenRouter's OpenAI-compatible chat API. The image goes
 * as a `data:` URI inside the message rather than as a sibling `inline_data`
 * part — that is the whole of the difference at this layer, and everything past
 * the `return` is identical to the Gemini path by construction.
 *
 * `HTTP-Referer` and `X-Title` are the attribution pair OpenRouter asks senders
 * for; they name the app on their dashboards and rankings and carry nothing
 * about the request. `response_format: json_object` is the counterpart of
 * Gemini's `responseMimeType` — the thing that actually stops a markdown fence,
 * with `unfence` still standing behind it for the models that fence anyway.
 */
async function callOpenRouter(body: ReceiptParseBody, config: ScanConfig): Promise<string> {
    const dispatcher = await proxyDispatcher()

    let response: Response
    try {
        response = await fetch(OPENROUTER_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.apiKey}`,
                'HTTP-Referer': 'https://peanutsplit.com',
                'X-Title': 'Peanut Split',
            },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: PROMPT },
                            {
                                type: 'image_url',
                                image_url: { url: `data:${body.mimeType};base64,${body.imageBase64}` },
                            },
                        ],
                    },
                ],
                response_format: { type: 'json_object' },
                // Zero temperature because this is transcription, not writing:
                // the same photo should produce the same split twice.
                temperature: 0,
                // Generous: a long bill is a long answer, and a truncated one is
                // unparseable JSON — a cheap ceiling here costs the whole scan.
                max_tokens: 4096,
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            // `dispatcher` is undici's, not the fetch standard's — same cast, and
            // the same price, as the email transport pays.
            ...(dispatcher ? ({ dispatcher } as Record<string, unknown>) : {}),
        })
    } catch (err) {
        // Status only. The request body is a photograph of somebody's dinner.
        console.error('[scan] model request failed', err instanceof Error ? err.name : 'unknown')
        throw scanFailed()
    }

    const payload = (await response.json().catch(() => null)) as {
        choices?: { message?: { content?: string } }[]
        error?: { message?: string; code?: string | number }
    } | null

    // OpenRouter reports an upstream refusal two ways — a non-2xx, and a 200
    // carrying an `error` object where the choices should be (a provider that
    // failed after the stream opened). They are the same outcome here, and
    // checking only the status is how the second one becomes "the model
    // returned an empty answer" three log lines later.
    if (!response.ok || payload?.error) {
        // Code, never `error.message`: OpenRouter quotes provider text back in
        // it, and provider text has been known to include the prompt.
        console.error(`[scan] model rejected the request (${response.status} ${payload?.error?.code ?? 'unknown'})`)
        throw scanFailed()
    }

    const text = (payload?.choices?.[0]?.message?.content ?? '').trim()
    if (!text) {
        console.error('[scan] model returned an empty candidate')
        throw scanFailed()
    }
    return text
}

/**
 * Strip a markdown fence if one survived `responseMimeType`. Cheap insurance
 * against the one failure mode that is both common and trivially recoverable.
 */
function unfence(text: string): string {
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim())
    return fenced ? fenced[1] : text.trim()
}

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

/** ISO-4217 only if we actually support it. An unsupported guess is worse than
 *  no guess: the review screen falls back to the room's currency, which is right
 *  far more often than a currency the app cannot price. */
function coerceCurrency(raw: unknown): string | null {
    if (typeof raw !== 'string') return null
    const code = raw.trim().toUpperCase()
    return CURRENCY_CODES.includes(code) ? code : null
}

/** A date is a nicety, so the bar is "unambiguous and plausible" — anything else
 *  is dropped rather than guessed at, and the expense keeps today's date. */
function coerceDate(raw: unknown): string | null {
    if (typeof raw !== 'string') return null
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim())
    if (!match) return null
    const [, year, month, day] = match
    const iso = `${year}-${month}-${day}`
    const parsed = new Date(`${iso}T00:00:00.000Z`)
    if (Number.isNaN(parsed.getTime())) return null
    // Round-trip catches 2026-02-31, which `Date` happily rolls into March.
    if (parsed.toISOString().slice(0, 10) !== iso) return null
    const yearNumber = Number(year)
    const nextYear = new Date().getUTCFullYear() + 1
    if (yearNumber < 2000 || yearNumber > nextYear) return null
    return iso
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
export function normalizeReceipt(rawText: string): ParsedReceipt {
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
        currency: coerceCurrency(envelope.data.currency),
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
 *  back numbers we counted ourselves. The transport is chosen here and nowhere
 *  else — past this line the two paths are one string of model text. */
export async function parseReceipt(body: ReceiptParseBody): Promise<ParsedReceipt> {
    const config = scanConfig()
    // The route checks `scanEnabled()` first, so this is the belt to that brace
    // — and the only correct answer for a caller that skipped it.
    if (!config) throw new ApiError(503, 'SCAN_UNAVAILABLE', 'receipt scanning is not configured')

    const text = config.transport === 'openrouter' ? await callOpenRouter(body, config) : await callGemini(body, config)
    return normalizeReceipt(text)
}
