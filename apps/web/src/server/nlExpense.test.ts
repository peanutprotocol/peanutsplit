/**
 * What a typed line is allowed to mean.
 *
 * Everything here is the server's half of quick add, and it splits in two:
 * `normalizeNlExpense`, which is pure and gets the bulk of the file because it
 * is where a wrong number would come from; and one small transport suite,
 * because "the same helper the scan uses, minus the image" is a claim worth
 * holding to a wire assertion rather than a comment.
 *
 * The fixtures are model ANSWERS, not typed sentences: the model's reading is
 * the boundary this module defends, and a test that fed it real Spanish would be
 * testing Google's weights instead of our code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/server/http'
import { matchMember, nlPrompt, normalizeNlExpense, parseNlExpense } from '@/server/nlExpense'

const OPENROUTER_KEY = 'test-openrouter-key'
const GEMINI_KEY = 'test-gemini-key'
const TODAY = '2026-07-28'

const ROOM = [
    { id: 'm-ana', name: 'Ana' },
    { id: 'm-bob', name: 'Bob' },
    { id: 'm-maria', name: 'María Fernanda' },
]

const parse = (answer: unknown, members: readonly { id: string; name: string }[] = ROOM) =>
    normalizeNlExpense(JSON.stringify(answer), { members })

const codeOf = (fn: () => unknown): string => {
    try {
        fn()
    } catch (err) {
        if (err instanceof ApiError) return err.code
        throw err
    }
    throw new Error('expected a throw')
}

describe('normalizing what the model read', () => {
    it('takes a clean answer through unchanged, resolving both kinds of name', () => {
        const { draft, unmatchedNames } = parse({
            description: 'Taxi to the airport',
            amountMinor: '1200',
            currency: 'EUR',
            date: '2026-07-27',
            payerName: 'Ana',
            participantNames: ['Ana', 'Bob'],
        })

        expect(draft).toEqual({
            description: 'Taxi to the airport',
            amountMinor: '1200',
            currency: 'EUR',
            date: '2026-07-27',
            paidById: 'm-ana',
            participantIds: ['m-ana', 'm-bob'],
        })
        expect(unmatchedNames).toEqual([])
    })

    it('reads "cena 45 pagó Ana" — a payer, no currency, and nobody named to split with', () => {
        // The Spanish case that motivated the feature. `currency: null` is the
        // important assertion: the sentence is in Spanish and says nothing about
        // a currency, and inferring EUR from the language is how an Argentine
        // room starts pricing dinners in euros. The room's currency wins on the
        // client instead.
        const { draft } = parse({ description: 'cena', amountMinor: '4500', payerName: 'Ana' })

        expect(draft.description).toBe('cena')
        expect(draft.amountMinor).toBe('4500')
        expect(draft.currency).toBeNull()
        expect(draft.paidById).toBe('m-ana')
        // Null, not `[]`: nobody was named, so this is "everyone", and the form
        // leaves the participant list untouched.
        expect(draft.participantIds).toBeNull()
    })

    it('refuses an answer with no amount rather than inventing one', () => {
        // Also the answer for a line that was never about an expense: the model
        // returns `{}` for those, and "we found no amount in that" is the honest
        // thing to say about both.
        expect(codeOf(() => parse({ description: 'lunch', payerName: 'Ana' }))).toBe('NL_NO_AMOUNT')
        expect(codeOf(() => parse({}))).toBe('NL_NO_AMOUNT')
        // Zero is not an amount either — the form could not save it.
        expect(codeOf(() => parse({ amountMinor: '0' }))).toBe('NL_NO_AMOUNT')
        // Neither is a negative, or a run of digits past the plausible ceiling.
        expect(codeOf(() => parse({ amountMinor: '-500' }))).toBe('NL_NO_AMOUNT')
        expect(codeOf(() => parse({ amountMinor: '9'.repeat(13) }))).toBe('NL_NO_AMOUNT')
    })

    it('drops a currency the app cannot price instead of passing it on', () => {
        expect(parse({ amountMinor: '1200', currency: 'XBT' }).draft.currency).toBeNull()
        expect(parse({ amountMinor: '1200', currency: 'gbp' }).draft.currency).toBe('GBP')
    })

    it('drops a date it cannot trust and keeps one it can', () => {
        expect(parse({ amountMinor: '1200', date: 'yesterday' }).draft.date).toBeNull()
        expect(parse({ amountMinor: '1200', date: '2026-02-31' }).draft.date).toBeNull()
        expect(parse({ amountMinor: '1200', date: '2026-07-27' }).draft.date).toBe('2026-07-27')
    })

    it('matches names across accents and across first names', () => {
        // A phone keyboard drops accents and a friend is called by their first
        // name; neither should cost somebody a payer chip.
        expect(parse({ amountMinor: '1', payerName: 'maria' }).draft.paidById).toBe('m-maria')
        expect(parse({ amountMinor: '1', payerName: 'María' }).draft.paidById).toBe('m-maria')
        expect(parse({ amountMinor: '1', payerName: 'MARÍA FERNANDA' }).draft.paidById).toBe('m-maria')
        expect(parse({ amountMinor: '1', payerName: '  ana  ' }).draft.paidById).toBe('m-ana')
    })

    it('surfaces a name it could not place instead of picking the nearest one', () => {
        const { draft, unmatchedNames } = parse({
            amountMinor: '4500',
            payerName: 'Kush',
            participantNames: ['Ana', 'Jota'],
        })

        expect(draft.paidById).toBeNull()
        expect(draft.participantIds).toEqual(['m-ana'])
        expect(unmatchedNames).toEqual(['Kush', 'Jota'])
    })

    it('refuses to break a tie between two people with the same first name', () => {
        // The whole reason `unmatchedNames` exists. One tap fixes an unmatched
        // name; a wrong guess is a balance nobody reconciles until the trip ends.
        const twoAnas = [
            { id: 'm-1', name: 'Ana García' },
            { id: 'm-2', name: 'Ana Silva' },
        ]
        const { draft, unmatchedNames } = parse({ amountMinor: '100', payerName: 'Ana' }, twoAnas)

        expect(draft.paidById).toBeNull()
        expect(unmatchedNames).toEqual(['Ana'])
        // An exact spelling still resolves — ambiguity is not contagious.
        expect(parse({ amountMinor: '100', payerName: 'Ana Silva' }, twoAnas).draft.paidById).toBe('m-2')
    })

    it('falls back to everyone when it could place nobody, rather than to no one', () => {
        const { draft, unmatchedNames } = parse({ amountMinor: '100', participantNames: ['Jota', 'Kush'] })
        // An empty participant list would mean "split this between no one", which
        // is not a thing anybody typed and which the form could not save.
        expect(draft.participantIds).toBeNull()
        expect(unmatchedNames).toEqual(['Jota', 'Kush'])
    })

    it('reports a name once however many times it was said', () => {
        const { unmatchedNames } = parse({ amountMinor: '100', payerName: 'Jota', participantNames: ['Jota', 'Ana'] })
        expect(unmatchedNames).toEqual(['Jota'])
    })

    it('keeps one member per person however the model spelled them', () => {
        const { draft } = parse({ amountMinor: '100', participantNames: ['Ana', 'ana', 'ANA'] })
        expect(draft.participantIds).toEqual(['m-ana'])
    })

    it('survives junk in the participant list without losing the people it read', () => {
        const { draft } = parse({ amountMinor: '100', participantNames: ['Ana', 42, null, '', 'Bob'] })
        expect(draft.participantIds).toEqual(['m-ana', 'm-bob'])
    })

    it('clips a description that turned into a paragraph', () => {
        const { draft } = parse({ amountMinor: '100', description: 'a'.repeat(200) })
        expect(draft.description).toHaveLength(80)
    })

    it('leaves the description null when the model only read a number', () => {
        // Null means "the text did not say" and the form keeps what it had —
        // there is no placeholder description worth inventing.
        expect(parse({ amountMinor: '100' }).draft.description).toBeNull()
        expect(parse({ amountMinor: '100', description: '   ' }).draft.description).toBeNull()
    })

    it('normalises the amount the way every other amount on this surface is', () => {
        expect(parse({ amountMinor: '007' }).draft.amountMinor).toBe('7')
        expect(parse({ amountMinor: 1200 }).draft.amountMinor).toBe('1200')
    })

    it('reads a fenced answer, and refuses one that is not JSON at all', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const fenced = '```json\n{"amountMinor":"1200"}\n```'
        expect(normalizeNlExpense(fenced, { members: ROOM }).draft.amountMinor).toBe('1200')
        expect(codeOf(() => normalizeNlExpense('sure! here you go', { members: ROOM }))).toBe('NL_FAILED')
        expect(codeOf(() => normalizeNlExpense('"a string"', { members: ROOM }))).toBe('NL_FAILED')
        vi.restoreAllMocks()
    })
})

describe('matchMember', () => {
    it('is the one place a name becomes a person, and answers null rather than guessing', () => {
        expect(matchMember('Bob', ROOM)?.id).toBe('m-bob')
        expect(matchMember('bob', ROOM)?.id).toBe('m-bob')
        expect(matchMember('', ROOM)).toBeNull()
        expect(matchMember('   ', ROOM)).toBeNull()
        expect(matchMember('Roberto', ROOM)).toBeNull()
    })
})

describe('the prompt', () => {
    it('injects today, so relative words resolve against the server clock and not the model', () => {
        const prompt = nlPrompt(TODAY)
        expect(prompt).toContain(TODAY)
        // The three words this product actually receives.
        expect(prompt).toContain('ayer')
        expect(prompt).toContain('ontem')
        // The rule that keeps a wrong number out of a money field.
        expect(prompt).toContain('NEVER invent an amount')
    })
})

describe('the transport, shared with the scan', () => {
    beforeEach(() => {
        delete process.env.SPLIT_OPENROUTER_API_KEY
        delete process.env.SPLIT_GEMINI_API_KEY
        delete process.env.SPLIT_SCAN_MODEL
        delete process.env.SPLIT_GEMINI_MODEL
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    const answer = (payload: unknown) =>
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 })

    const sentBody = (spy: { mock: { calls: unknown[][] } }): Record<string, any> =>
        JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body))

    it('is unavailable with no key, and a call that arrives anyway never reaches the network', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
        await expect(parseNlExpense({ text: 'taxi 12' }, { members: ROOM, today: TODAY })).rejects.toMatchObject({
            code: 'NL_UNAVAILABLE',
        })
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('sends ONE text part and no image, with the typed line after the rules', async () => {
        process.env.SPLIT_OPENROUTER_API_KEY = OPENROUTER_KEY
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(answer({ amountMinor: '1200' }))

        await parseNlExpense({ text: 'taxi 12 EUR ayer' }, { members: ROOM, today: TODAY })

        const payload = sentBody(fetchSpy)
        expect(payload.messages).toHaveLength(1)
        expect(payload.messages[0].content).toHaveLength(1)
        expect(payload.messages[0].content[0].type).toBe('text')
        expect(payload.response_format).toEqual({ type: 'json_object' })
        expect(payload.temperature).toBe(0)
        // A short answer needs a short ceiling — the scan's 4096 is sized for a
        // sixty-line bill and this is one object.
        expect(payload.max_tokens).toBe(1024)

        const text: string = payload.messages[0].content[0].text
        expect(text).toContain(TODAY)
        // After the rules, never interpolated into them: a sentence containing
        // "Rules:" has to read as text rather than as instructions.
        expect(text.indexOf('taxi 12 EUR ayer')).toBeGreaterThan(text.indexOf('NEVER invent an amount'))
    })

    it('rides the Gemini fallback when that is the only key, still with no image part', async () => {
        process.env.SPLIT_GEMINI_API_KEY = GEMINI_KEY
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    candidates: [{ content: { parts: [{ text: JSON.stringify({ amountMinor: '1200' }) }] } }],
                }),
                { status: 200 }
            )
        )

        const { draft } = await parseNlExpense({ text: 'taxi 12' }, { members: ROOM, today: TODAY })
        expect(draft.amountMinor).toBe('1200')

        const payload = sentBody(fetchSpy)
        expect(payload.contents[0].parts).toHaveLength(1)
        expect(payload.generationConfig.responseMimeType).toBe('application/json')
        expect(payload.generationConfig.maxOutputTokens).toBe(1024)
    })

    it('never lets the typed line reach a log, whatever the provider says back', async () => {
        // The promise this whole feature rests on: what somebody types is a line
        // out of their group chat. Not the text, not an echo of it in a provider
        // error message, not the key.
        process.env.SPLIT_OPENROUTER_API_KEY = OPENROUTER_KEY
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    error: { code: 'bad_request', message: 'could not process: dinner with Ana 45 EUR' },
                }),
                { status: 400 }
            )
        )

        await expect(
            parseNlExpense({ text: 'dinner with Ana 45 EUR' }, { members: ROOM, today: TODAY })
        ).rejects.toMatchObject({ code: 'NL_FAILED' })

        const logged = error.mock.calls.map((call) => call.map(String).join(' ')).join('\n')
        expect(logged).toContain('400')
        expect(logged).toContain('bad_request')
        expect(logged).not.toContain('dinner with Ana')
        expect(logged).not.toContain(OPENROUTER_KEY)
    })
})
