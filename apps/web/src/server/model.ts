/**
 * The wire to a language model, and the two interchangeable transports over it.
 *
 * This file exists because Split now has TWO typing-removers — a photo of a bill
 * (`server/receipt.ts`) and a line of free text (`server/nlExpense.ts`) — and
 * exactly one thing they should share: how a request leaves the container and
 * how a failure is spoken about. Everything that decides what an answer MEANS
 * stays in the feature module; nothing here knows what a receipt or an expense
 * is.
 *
 * Three properties, all of them the kind that quietly stop being true if nobody
 * writes them down:
 *
 * 1. **Nothing sent is persisted.** A photograph of a receipt and a line pasted
 *    out of a group chat are the same category of thing: someone's private
 *    life, handed over once for a few seconds of work. There is no column, no
 *    bucket, no temp file, on either path.
 * 2. **Content never reaches a log.** No labels, no amounts, no merchant, no
 *    typed text, not in an error path either. Every `console.error` below
 *    carries a status code — and, on OpenRouter, the machine-readable error code
 *    beside it — and nothing else. Never `error.message`: a provider is free to
 *    quote the request back at you in it. If you are debugging this in
 *    production and wishing for the payload, that wish is the feature working.
 * 3. **The model's arithmetic is never trusted.** Callers re-derive every number
 *    through the `minorAmount` primitive in `server/validation.ts`. This module
 *    hands back a string and makes no claim about it at all.
 *
 * ONE key, BOTH features. `modelConfig()` is the only place a transport is
 * chosen, and a deployment that can read a bill can also read a typed line —
 * there is no second env var and no second capability probe, because a second
 * boolean that must always equal the first is a bug waiting for a deploy.
 *
 * - **OpenRouter** (`SPLIT_OPENROUTER_API_KEY`) — preferred. It fronts the same
 *   Gemini weights alongside every other model behind one bill and one per-key
 *   spend cap, so "the cheapest model that can do this" becomes an env change
 *   rather than a second integration to write and keep alive.
 * - **Gemini direct** (`SPLIT_GEMINI_API_KEY`) — the original path, kept as the
 *   fallback so a key we already hold stays sufficient on its own.
 *
 * Neither key is a first-class state: the capability probe says
 * `enabled: false`, the UI hides both affordances, and a POST that arrives
 * anyway answers 503. Nothing half-works.
 */

import { egressFetch, type EgressResponse } from '@/server/egress'
import { ApiError } from '@/server/http'
import { CURRENCY_CODES } from '@/server/money'

/**
 * Flash-Lite is the cheapest model in the 2.5 family that reads printed text off
 * a photo well, and reading one typed line is strictly easier than that.
 * Overridable because "cheapest current" is a fact with a shelf life, and a
 * model swap should not need a deploy of new code.
 */
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'
/** The same weights, spelled the way OpenRouter's catalog addresses them. Two
 *  constants rather than one because the two APIs do not share a namespace —
 *  `gemini-2.5-flash-lite` is a 404 on OpenRouter and vice versa. */
const DEFAULT_OPENROUTER_MODEL = 'google/gemini-2.5-flash-lite'
const GEMINI_HOST = 'https://generativelanguage.googleapis.com'
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

/** The model gets one shot and a hard stop. A phone on hotel wifi has already
 *  given up by 25s, and a hung request holds a serverless invocation open. */
const REQUEST_TIMEOUT_MS = 25_000

export type ModelConfig =
    { transport: 'openrouter'; apiKey: string; model: string } | { transport: 'gemini'; apiKey: string; model: string }

/**
 * The one place a transport is chosen. Read per call, never at import: env
 * arrives after the module graph in some runtimes, and a module-level snapshot
 * would cache "unconfigured" forever — the same reason `emailConfig()` is a
 * function.
 *
 * The env names still say SCAN because scanning shipped first and renaming a
 * variable that is already set on a running deployment costs an outage to buy a
 * tidier word.
 */
export function modelConfig(): ModelConfig | null {
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

/** Either key is enough, and it answers for the FEATURE SET, not for a provider
 *  — swapping transports must never make a button flicker out of existence, and
 *  neither must adding a second feature behind the same key. */
export const modelEnabled = (): boolean => modelConfig() !== null

export interface ModelCall {
    /** Log namespace — and the only thing about this call that reaches a log. */
    tag: string
    prompt: string
    /** Omitted for a text-only call. */
    image?: { base64: string; mimeType: string }
    /**
     * Answer ceiling. A truncated answer is unparseable JSON, so this is sized
     * to the longest LEGITIMATE answer rather than the typical one — a cheap
     * ceiling here costs the whole call.
     */
    maxOutputTokens: number
    /** Every way a call can fail upstream is one thing to the person holding the
     *  phone, and each feature says it in its own words. One factory per caller
     *  so two transports cannot drift into saying it differently. */
    failed: () => ApiError
}

// Proxy routing lives in `server/egress.ts` — Next's patched global fetch
// drops undici's dispatcher option (a bare TypeError took down the first
// real scan in production), so the proxied path must bypass it entirely.

/** The model's raw answer, as text. Everything about whether it is *usable*
 *  belongs to the caller — these functions only know about HTTP. */
async function callGemini(call: ModelCall, config: ModelConfig): Promise<string> {
    const parts: unknown[] = [{ text: call.prompt }]
    if (call.image) parts.push({ inline_data: { mime_type: call.image.mimeType, data: call.image.base64 } })

    let response: EgressResponse
    try {
        response = await egressFetch(process.env.SPLIT_SCAN_PROXY_URL, `${GEMINI_HOST}/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: {
                    // Zero temperature because this is transcription, not writing:
                    // the same input should produce the same expense twice.
                    temperature: 0,
                    responseMimeType: 'application/json',
                    maxOutputTokens: call.maxOutputTokens,
                },
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
    } catch (err) {
        // Status only. The request body is a photograph of somebody's dinner, or
        // a line out of their group chat.
        console.error(`[${call.tag}] model request failed`, err instanceof Error ? err.name : 'unknown')
        throw call.failed()
    }

    if (!response.ok) {
        console.error(`[${call.tag}] model rejected the request (${response.status})`)
        throw call.failed()
    }

    const payload = (await response.json().catch(() => null)) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
    } | null

    const text = (payload?.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('')
        .trim()

    if (!text) {
        console.error(`[${call.tag}] model returned an empty candidate`)
        throw call.failed()
    }
    return text
}

/**
 * The same request over OpenRouter's OpenAI-compatible chat API. An image, when
 * there is one, goes as a `data:` URI inside the message rather than as a
 * sibling `inline_data` part — that is the whole of the difference at this
 * layer, and everything past the `return` is identical to the Gemini path by
 * construction.
 *
 * `HTTP-Referer` and `X-Title` are the attribution pair OpenRouter asks senders
 * for; they name the app on their dashboards and rankings and carry nothing
 * about the request. `response_format: json_object` is the counterpart of
 * Gemini's `responseMimeType` — the thing that actually stops a markdown fence,
 * with `unfence` still standing behind it for the models that fence anyway.
 */
async function callOpenRouter(call: ModelCall, config: ModelConfig): Promise<string> {
    const content: unknown[] = [{ type: 'text', text: call.prompt }]
    if (call.image) {
        content.push({
            type: 'image_url',
            image_url: { url: `data:${call.image.mimeType};base64,${call.image.base64}` },
        })
    }

    let response: EgressResponse
    try {
        response = await egressFetch(process.env.SPLIT_SCAN_PROXY_URL, OPENROUTER_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.apiKey}`,
                'HTTP-Referer': 'https://peanutsplit.com',
                'X-Title': 'Peanut Split',
            },
            body: JSON.stringify({
                model: config.model,
                messages: [{ role: 'user', content }],
                response_format: { type: 'json_object' },
                // Zero temperature because this is transcription, not writing:
                // the same input should produce the same expense twice.
                temperature: 0,
                max_tokens: call.maxOutputTokens,
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
    } catch (err) {
        // Status only. The request body is a photograph of somebody's dinner, or
        // a line out of their group chat.
        console.error(`[${call.tag}] model request failed`, err instanceof Error ? err.name : 'unknown')
        throw call.failed()
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
        console.error(
            `[${call.tag}] model rejected the request (${response.status} ${payload?.error?.code ?? 'unknown'})`
        )
        throw call.failed()
    }

    const text = (payload?.choices?.[0]?.message?.content ?? '').trim()
    if (!text) {
        console.error(`[${call.tag}] model returned an empty candidate`)
        throw call.failed()
    }
    return text
}

/**
 * Send one call over whichever wire is configured. The transport is chosen here
 * and nowhere else — past this line the two paths are one string of model text.
 */
export async function callModel(call: ModelCall, config: ModelConfig): Promise<string> {
    return config.transport === 'openrouter' ? callOpenRouter(call, config) : callGemini(call, config)
}

/**
 * Strip a markdown fence if one survived the JSON-mode switch. Cheap insurance
 * against the one failure mode that is both common and trivially recoverable.
 */
export function unfence(text: string): string {
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim())
    return fenced ? fenced[1] : text.trim()
}

/** ISO-4217 only if we actually support it. An unsupported guess is worse than
 *  no guess: every caller falls back to the room's currency, which is right far
 *  more often than a currency the app cannot price. */
export function coerceCurrency(raw: unknown): string | null {
    if (typeof raw !== 'string') return null
    const code = raw.trim().toUpperCase()
    return CURRENCY_CODES.includes(code) ? code : null
}

/** A date is a nicety, so the bar is "unambiguous and plausible" — anything else
 *  is dropped rather than guessed at, and the expense keeps today's date. */
export function coerceDate(raw: unknown): string | null {
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
