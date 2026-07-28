/**
 * The transport seam: which wire a scan leaves on, and what it looks like once
 * it does.
 *
 * Normalization is `receipt.test.ts`'s job and is deliberately absent here —
 * it is transport-blind, and asserting it twice would only prove the copy
 * exists. What a second transport can newly break is exactly two things: it can
 * be picked when it should not be, and it can say something different to the
 * model once it is. Both are below, and the last test in the selection suite is
 * the one that matters most — it compares the two prompts byte for byte, so
 * "they share the string" stays a fact rather than a comment.
 *
 * `fetch` is the only fake. The error cases also watch `console.error`, because
 * the module's no-content-in-logs rule is a promise to users, not a style note,
 * and a new transport is precisely where a provider's chatty error message gets
 * pasted into a log line by accident.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/server/http'
import { modelEnabled } from '@/server/model'
import { parseReceipt } from '@/server/receipt'

const OPENROUTER_KEY = 'test-openrouter-key'
const GEMINI_KEY = 'test-gemini-key'

const IMAGE = 'QUJDREVG'
const body = { imageBase64: IMAGE, mimeType: 'image/jpeg' as const }

/** One line item is enough — this suite is about the envelope, not the bill. */
const RECEIPT = JSON.stringify({ items: [{ label: 'Beer', amountMinor: '500' }] })

/** OpenRouter's OpenAI-shaped answer. */
const openRouterAnswer = (content: string) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })

/** Gemini's native answer, for the fallback path. */
const geminiAnswer = (text: string) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })

const stubFetch = () => vi.spyOn(globalThis, 'fetch')

type Sent = { url: string; init: RequestInit & { headers: Record<string, string> } }

/** The recorded call, with the headers narrowed — they go out as a plain object
 *  literal, which `HeadersInit` alone does not let you index. */
const sentAt = (spy: ReturnType<typeof stubFetch>, index = 0): Sent => {
    const [url, init] = spy.mock.calls[index]
    return { url: String(url), init: init as Sent['init'] }
}

const sentBody = (sent: Sent): Record<string, any> => JSON.parse(String(sent.init.body))

const codeOf = async (fn: () => Promise<unknown>): Promise<string> => {
    try {
        await fn()
    } catch (err) {
        if (err instanceof ApiError) return err.code
        throw err
    }
    throw new Error('expected a throw')
}

beforeEach(() => {
    delete process.env.SPLIT_OPENROUTER_API_KEY
    delete process.env.SPLIT_GEMINI_API_KEY
    delete process.env.SPLIT_SCAN_MODEL
    delete process.env.SPLIT_GEMINI_MODEL
    delete process.env.SPLIT_SCAN_PROXY_URL
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('transport selection', () => {
    it('is disabled with neither key, and a call that arrives anyway never reaches the network', async () => {
        const fetchSpy = stubFetch()
        expect(modelEnabled()).toBe(false)
        expect(await codeOf(() => parseReceipt(body))).toBe('SCAN_UNAVAILABLE')
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('is enabled on either key alone — the probe answers for the feature, not a provider', () => {
        process.env.SPLIT_OPENROUTER_API_KEY = OPENROUTER_KEY
        expect(modelEnabled()).toBe(true)

        delete process.env.SPLIT_OPENROUTER_API_KEY
        process.env.SPLIT_GEMINI_API_KEY = GEMINI_KEY
        expect(modelEnabled()).toBe(true)
    })

    it('prefers OpenRouter when both are configured', async () => {
        process.env.SPLIT_OPENROUTER_API_KEY = OPENROUTER_KEY
        process.env.SPLIT_GEMINI_API_KEY = GEMINI_KEY
        const fetchSpy = stubFetch().mockResolvedValueOnce(openRouterAnswer(RECEIPT))

        await parseReceipt(body)
        expect(sentAt(fetchSpy).url).toBe('https://openrouter.ai/api/v1/chat/completions')
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('falls back to Gemini direct with only its key, unchanged from before OpenRouter existed', async () => {
        process.env.SPLIT_GEMINI_API_KEY = GEMINI_KEY
        const fetchSpy = stubFetch().mockResolvedValueOnce(geminiAnswer(RECEIPT))

        const parsed = await parseReceipt(body)
        expect(parsed.suggestedTotalMinor).toBe('500')

        const sent = sentAt(fetchSpy)
        expect(sent.url).toContain('generativelanguage.googleapis.com')
        expect(sent.url).toContain('gemini-2.5-flash-lite:generateContent')
        expect(sent.init.headers['x-goog-api-key']).toBe(GEMINI_KEY)
        const payload = sentBody(sent)
        expect(payload.contents[0].parts[1].inline_data).toEqual({ mime_type: 'image/jpeg', data: IMAGE })
        expect(payload.generationConfig.responseMimeType).toBe('application/json')
        expect(payload.generationConfig.temperature).toBe(0)
    })

    it('sends both transports the same prompt, character for character', async () => {
        // The point of factoring the prompt out. If this ever fails, the two
        // wires have become two products: same button, same screen, different
        // rules about what counts as a line item.
        process.env.SPLIT_OPENROUTER_API_KEY = OPENROUTER_KEY
        const openRouter = stubFetch().mockResolvedValueOnce(openRouterAnswer(RECEIPT))
        await parseReceipt(body)
        const openRouterPrompt = sentBody(sentAt(openRouter)).messages[0].content[0].text
        vi.restoreAllMocks()

        delete process.env.SPLIT_OPENROUTER_API_KEY
        process.env.SPLIT_GEMINI_API_KEY = GEMINI_KEY
        const gemini = stubFetch().mockResolvedValueOnce(geminiAnswer(RECEIPT))
        await parseReceipt(body)
        const geminiPrompt = sentBody(sentAt(gemini)).contents[0].parts[0].text

        expect(openRouterPrompt).toBe(geminiPrompt)
        expect(openRouterPrompt).toContain('amountMinor')
    })
})

describe('OpenRouter — the request', () => {
    beforeEach(() => {
        process.env.SPLIT_OPENROUTER_API_KEY = OPENROUTER_KEY
    })

    it('sends the image as a data URI beside the prompt, with the key and the attribution pair', async () => {
        const fetchSpy = stubFetch().mockResolvedValueOnce(
            openRouterAnswer(
                JSON.stringify({
                    items: [
                        { label: 'Margherita', amountMinor: '1200', quantity: 2 },
                        { label: 'Water', amountMinor: '350' },
                    ],
                    total: { amountMinor: '1550' },
                    currency: 'EUR',
                    merchant: 'Da Nino',
                    date: '2026-07-15',
                })
            )
        )

        // The canned answer goes through the SAME normalization the Gemini path
        // uses — the whole point of the change is that only the wire differs.
        const parsed = await parseReceipt(body)
        expect(parsed.items).toEqual([
            { label: 'Margherita', amountMinor: '1200', quantity: 2 },
            { label: 'Water', amountMinor: '350', quantity: null },
        ])
        expect(parsed.suggestedTotalMinor).toBe('1550')
        expect(parsed.receiptTotalMinor).toBe('1550')
        expect(parsed.currency).toBe('EUR')
        expect(parsed.merchant).toBe('Da Nino')
        expect(parsed.date).toBe('2026-07-15')

        const sent = sentAt(fetchSpy)
        expect(sent.url).toBe('https://openrouter.ai/api/v1/chat/completions')
        expect(sent.init.method).toBe('POST')
        expect(sent.init.headers.Authorization).toBe(`Bearer ${OPENROUTER_KEY}`)
        expect(sent.init.headers['HTTP-Referer']).toBe('https://peanutsplit.com')
        expect(sent.init.headers['X-Title']).toBe('Peanut Split')

        const payload = sentBody(sent)
        expect(payload.model).toBe('google/gemini-2.5-flash-lite')
        expect(payload.response_format).toEqual({ type: 'json_object' })
        expect(payload.temperature).toBe(0)
        expect(payload.max_tokens).toBe(4096)
        expect(payload.messages).toHaveLength(1)
        expect(payload.messages[0].role).toBe('user')
        expect(payload.messages[0].content[1]).toEqual({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${IMAGE}` },
        })
    })

    it('takes the model from SPLIT_SCAN_MODEL, so a swap is an env change', async () => {
        process.env.SPLIT_SCAN_MODEL = 'qwen/qwen2.5-vl-72b-instruct'
        // The Gemini-path override is not read here: two APIs, two namespaces.
        process.env.SPLIT_GEMINI_MODEL = 'gemini-3-pro'
        const fetchSpy = stubFetch().mockResolvedValueOnce(openRouterAnswer(RECEIPT))

        await parseReceipt(body)
        expect(sentBody(sentAt(fetchSpy)).model).toBe('qwen/qwen2.5-vl-72b-instruct')
    })

    it('routes through the pinned proxy when one is configured — the prod container has no egress', async () => {
        process.env.SPLIT_SCAN_PROXY_URL = 'http://proxy.internal:3128'
        const fetchSpy = stubFetch().mockResolvedValueOnce(openRouterAnswer(RECEIPT))

        await parseReceipt(body)
        expect((sentAt(fetchSpy).init as { dispatcher?: unknown }).dispatcher).toBeDefined()
    })

    it('strips a markdown fence with the same helper the Gemini path uses', async () => {
        // `response_format` is supposed to make this impossible; models fence
        // anyway. Shared, not re-implemented — a second copy is a second bug.
        stubFetch().mockResolvedValueOnce(openRouterAnswer(`\`\`\`json\n${RECEIPT}\n\`\`\``))

        const parsed = await parseReceipt(body)
        expect(parsed.items).toEqual([{ label: 'Beer', amountMinor: '500', quantity: null }])
    })
})

describe('OpenRouter — the failures', () => {
    beforeEach(() => {
        process.env.SPLIT_OPENROUTER_API_KEY = OPENROUTER_KEY
    })

    /** Every argument the module handed `console.error`, flattened. */
    const logged = (spy: { mock: { calls: unknown[][] } }): string =>
        spy.mock.calls.map((call) => call.map(String).join(' ')).join('\n')

    it('reads a non-2xx as a failed scan and logs the status and the code, nothing else', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        stubFetch().mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    error: { code: 'insufficient_quota', message: `credits exhausted while reading ${IMAGE}` },
                }),
                { status: 402 }
            )
        )

        expect(await codeOf(() => parseReceipt(body))).toBe('SCAN_FAILED')
        expect(logged(error)).toContain('402')
        expect(logged(error)).toContain('insufficient_quota')
        // The provider quoted our request back at us. It does not reach the log.
        expect(logged(error)).not.toContain(IMAGE)
        expect(logged(error)).not.toContain('credits exhausted')
        expect(logged(error)).not.toContain(OPENROUTER_KEY)
    })

    /**
     * The failure a status check alone misses: OpenRouter answers 200 with an
     * `error` object where the choices should be when a provider dies after the
     * response opened. Same outcome, and it has to be caught here — one level
     * down it reads as "the model returned nothing", which is a different bug
     * to chase.
     */
    it('reads a 200 carrying an error object as the failure it is', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        stubFetch().mockResolvedValueOnce(
            new Response(JSON.stringify({ error: { code: 502, message: 'upstream provider returned nothing' } }), {
                status: 200,
            })
        )

        expect(await codeOf(() => parseReceipt(body))).toBe('SCAN_FAILED')
        expect(logged(error)).toContain('502')
        expect(logged(error)).not.toContain('upstream provider returned nothing')
    })

    it('reads an empty answer and a dead hop as the same thing the user is told', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})

        stubFetch().mockResolvedValueOnce(openRouterAnswer(''))
        expect(await codeOf(() => parseReceipt(body))).toBe('SCAN_FAILED')

        vi.restoreAllMocks()
        vi.spyOn(console, 'error').mockImplementation(() => {})
        stubFetch().mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
        expect(await codeOf(() => parseReceipt(body))).toBe('SCAN_FAILED')
    })

    it('still distinguishes "nothing readable" from "the call failed"', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        stubFetch().mockResolvedValueOnce(openRouterAnswer(JSON.stringify({ items: [] })))

        expect(await codeOf(() => parseReceipt(body))).toBe('SCAN_NO_ITEMS')
    })
})
