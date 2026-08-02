/**
 * Normalization against fixture model answers.
 *
 * Every case here is a lie the model can tell, written down. The rule this suite
 * enforces is the one from the module header: it reads, we count. A wrong answer
 * from a language model is not an exceptional condition — it is Tuesday — and
 * the only acceptable failure mode is "fewer items than the receipt had", never
 * "a number nobody typed".
 */
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/server/http'
import { MAX_ITEMS, normalizeReceipt } from '@/server/receipt'

const answer = (payload: unknown) => JSON.stringify(payload)

const item = (label: string, amountMinor: string, extra: Record<string, unknown> = {}) => ({
    label,
    amountMinor,
    ...extra,
})

/** The failure the caller sees, as a code — the message is for logs. */
const codeOf = (fn: () => unknown): string => {
    try {
        fn()
    } catch (err) {
        if (err instanceof ApiError) return err.code
        throw err
    }
    throw new Error('expected a throw')
}

describe('normalizeReceipt — the happy shape', () => {
    it('reads items, total, currency, merchant and date', () => {
        const parsed = normalizeReceipt(
            answer({
                items: [item('Margherita', '1200', { quantity: 2 }), item('Sparkling water', '350')],
                total: { amountMinor: '1550' },
                currency: 'EUR',
                merchant: 'Trattoria da Nino',
                date: '2026-07-15',
            }),
            'EUR'
        )
        expect(parsed.items).toEqual([
            { label: 'Margherita', amountMinor: '1200', quantity: 2 },
            { label: 'Sparkling water', amountMinor: '350', quantity: null },
        ])
        expect(parsed.suggestedTotalMinor).toBe('1550')
        expect(parsed.receiptTotalMinor).toBe('1550')
        expect(parsed.currency).toBe('EUR')
        expect(parsed.merchant).toBe('Trattoria da Nino')
        expect(parsed.date).toBe('2026-07-15')
    })

    it('accepts a bare minimum answer — items and nothing else', () => {
        const parsed = normalizeReceipt(answer({ items: [item('Beer', '500')] }), 'EUR')
        expect(parsed.suggestedTotalMinor).toBe('500')
        expect(parsed.receiptTotalMinor).toBeNull()
        expect(parsed.currency).toBeNull()
        expect(parsed.merchant).toBeNull()
        expect(parsed.date).toBeNull()
    })

    it('survives a markdown fence the JSON mime type was supposed to prevent', () => {
        const parsed = normalizeReceipt('```json\n{"items":[{"label":"Café","amountMinor":"250"}]}\n```', 'EUR')
        expect(parsed.items).toHaveLength(1)
        expect(parsed.suggestedTotalMinor).toBe('250')
    })

    it('normalises amounts written with a leading zero or as a number', () => {
        const parsed = normalizeReceipt(answer({ items: [item('A', '007'), { label: 'B', amountMinor: 1250 }] }), 'EUR')
        expect(parsed.items.map((i) => i.amountMinor)).toEqual(['7', '1250'])
        expect(parsed.suggestedTotalMinor).toBe('1257')
    })
})

describe('normalizeReceipt — the model counts, we do not believe it', () => {
    it('recomputes the sum instead of trusting the total on the payload', () => {
        // The model claims the bill is 9999. The items say 1550. Both survive,
        // unreconciled, because only the person holding the paper knows which is
        // wrong — and the split is built from the items either way.
        const parsed = normalizeReceipt(
            answer({
                items: [item('Pasta', '1200'), item('Water', '350')],
                total: { amountMinor: '9999' },
            }),
            'EUR'
        )
        expect(parsed.suggestedTotalMinor).toBe('1550')
        expect(parsed.receiptTotalMinor).toBe('9999')
    })

    it('sums large COP-scale amounts exactly', () => {
        // Twelve digits is the ceiling per item (see `receiptAmountMinor`), and a
        // zero-decimal currency reaches it far sooner than a euro does. Summed as
        // BigInt, so the last digit is the one that was read.
        const parsed = normalizeReceipt(
            answer({ items: [item('A', '999999999999'), item('B', '1'), item('C', '999999999999')] }),
            'EUR'
        )
        expect(parsed.suggestedTotalMinor).toBe('1999999999999')
    })
})

describe('normalizeReceipt — malformed and absurd answers', () => {
    it('rejects an answer that is not JSON', () => {
        expect(codeOf(() => normalizeReceipt('I am sorry, I cannot read that receipt.', 'EUR'))).toBe('SCAN_FAILED')
    })

    it('rejects an answer that is JSON but not an object', () => {
        expect(codeOf(() => normalizeReceipt('[1,2,3]', 'EUR'))).toBe('SCAN_FAILED')
    })

    it('treats an empty item list as "nothing readable"', () => {
        expect(codeOf(() => normalizeReceipt(answer({ items: [] }), 'EUR'))).toBe('SCAN_NO_ITEMS')
    })

    it('treats a non-array items field as "nothing readable" rather than a crash', () => {
        expect(codeOf(() => normalizeReceipt(answer({ items: 'a beer and a pizza' }), 'EUR'))).toBe('SCAN_NO_ITEMS')
    })

    it('drops negative amounts and keeps the rest of the bill', () => {
        // A discount line the model was told not to emit. Dropping it is the
        // right failure: the totals disagree, the review screen says so.
        const parsed = normalizeReceipt(
            answer({ items: [item('Pizza', '1200'), item('Loyalty discount', '-200'), item('Beer', '500')] }),
            'EUR'
        )
        expect(parsed.items.map((i) => i.label)).toEqual(['Pizza', 'Beer'])
        expect(parsed.suggestedTotalMinor).toBe('1700')
    })

    it('drops implausibly large amounts', () => {
        const parsed = normalizeReceipt(
            answer({ items: [item('Coffee', '250'), item('Hallucination', '9'.repeat(30))] }),
            'EUR'
        )
        expect(parsed.items).toHaveLength(1)
        expect(parsed.suggestedTotalMinor).toBe('250')
    })

    it('drops rows with an unparseable amount or no label', () => {
        const parsed = normalizeReceipt(
            answer({
                items: [
                    item('Fine', '100'),
                    item('Decimal point', '12.34'),
                    item('Words', 'about twelve euros'),
                    { label: '   ', amountMinor: '900' },
                    { amountMinor: '900' },
                    'not even an object',
                    null,
                ],
            }),
            'EUR'
        )
        expect(parsed.items).toEqual([{ label: 'Fine', amountMinor: '100', quantity: null }])
    })

    it('caps the item count and keeps the first MAX_ITEMS', () => {
        const items = Array.from({ length: MAX_ITEMS + 1 }, (_, index) => item(`Item ${index}`, '100'))
        const parsed = normalizeReceipt(answer({ items }), 'EUR')
        expect(parsed.items).toHaveLength(MAX_ITEMS)
        expect(parsed.suggestedTotalMinor).toBe(String(MAX_ITEMS * 100))
    })

    it('truncates an over-long label instead of losing the money on that row', () => {
        const parsed = normalizeReceipt(answer({ items: [item('x'.repeat(200), '100')] }), 'EUR')
        expect(parsed.items[0].label).toHaveLength(80)
        expect(parsed.suggestedTotalMinor).toBe('100')
    })

    it('keeps an item whose quantity is nonsense', () => {
        const parsed = normalizeReceipt(answer({ items: [item('Beer', '500', { quantity: 'a few' })] }), 'EUR')
        expect(parsed.items[0]).toEqual({ label: 'Beer', amountMinor: '500', quantity: null })
    })
})

describe('normalizeReceipt — the optional fields', () => {
    const one = (extra: Record<string, unknown>) =>
        normalizeReceipt(answer({ items: [item('A', '100')], ...extra }), 'EUR')

    it('accepts a total given bare, as a string or a number', () => {
        expect(one({ total: '1550' }).receiptTotalMinor).toBe('1550')
        expect(one({ total: 1550 }).receiptTotalMinor).toBe('1550')
    })

    it('ignores a total that is negative, decimal, or not a number at all', () => {
        expect(one({ total: '-100' }).receiptTotalMinor).toBeNull()
        expect(one({ total: '15.50' }).receiptTotalMinor).toBeNull()
        expect(one({ total: { amountMinor: 'lots' } }).receiptTotalMinor).toBeNull()
    })

    it('upper-cases a supported currency and drops one the app cannot price', () => {
        expect(one({ currency: 'eur' }).currency).toBe('EUR')
        // The catalog is 162 codes wide now, so a scanned SEK receipt is kept.
        expect(one({ currency: 'SEK' }).currency).toBe('SEK')
        // KPW is real ISO 4217 and the rate feed does not carry it: a room cannot be priced in
        // it, so a guess here would be worse than the room's own currency.
        expect(one({ currency: 'KPW' }).currency).toBeNull()
        expect(one({ currency: '€' }).currency).toBeNull()
        expect(one({ currency: 42 }).currency).toBeNull()
    })

    it('keeps a real date and drops an impossible or unreadable one', () => {
        expect(one({ date: '2026-07-15' }).date).toBe('2026-07-15')
        expect(one({ date: '2026-07-15T20:31:00Z' }).date).toBe('2026-07-15')
        // Rolls into March if you let `Date` have it.
        expect(one({ date: '2026-02-31' }).date).toBeNull()
        expect(one({ date: '15/07/2026' }).date).toBeNull()
        expect(one({ date: '1712-07-15' }).date).toBeNull()
        expect(one({ date: '2999-07-15' }).date).toBeNull()
    })

    it('collapses a multi-line merchant and bounds its length', () => {
        expect(one({ merchant: ' Nino\n  Via Roma 12\n Milano ' }).merchant).toBe('Nino Via Roma 12 Milano')
        expect(one({ merchant: 'x'.repeat(200) }).merchant).toHaveLength(80)
        expect(one({ merchant: '   ' }).merchant).toBeNull()
    })
})
