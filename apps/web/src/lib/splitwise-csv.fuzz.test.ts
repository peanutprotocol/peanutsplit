/**
 * The parser meets input nobody wrote on purpose.
 *
 * `splitwise-csv.test.ts` covers the format: real exports, localised headers, quoted fields, the
 * caps. What it cannot cover is the long tail — a file half-copied out of a terminal, a spreadsheet
 * that wrote a lone CR, a body with a NUL in it, an export truncated mid-quote by a failed
 * download. This file generates those.
 *
 * TWO CONTRACTS, and they are the only ones a hostile file has to respect:
 *
 *   1. `parseSplitwiseCsv` throws nothing but `SplitwiseParseError`. Anything else reaches the
 *      import screen as a crash with no sentence on it, and the user is holding a file they cannot
 *      import and cannot be told why.
 *   2. Whatever it DOES return is internally consistent money: every expense's shares sum to its
 *      own cost, every cost is positive, no member name repeats, and every warning carries a code
 *      the UI can translate. An unbalanced parse is worse than a refusal — it becomes a room.
 */
import { describe, expect, it } from 'vitest'
import {
    MAX_DESCRIPTION_CHARS,
    MAX_NAME_CHARS,
    SplitwiseParseError,
    parseCsvRows,
    parseSplitwiseCsv,
    type SplitwiseImport,
} from '@/lib/splitwise-csv'

function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
    }
}

const between = (rng: () => number, low: number, high: number): number => low + Math.floor(rng() * (high - low + 1))
const pick = <T>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)]

/** Every character class that has ever broken a CSV reader. */
const HOSTILE = [
    '"',
    ',',
    '\n',
    '\r',
    '\r\n',
    '\u0000',
    '﻿',
    '\\',
    '=',
    '\t',
    'é',
    '👨‍👩‍👧‍👦',
    '𝟘',
    '−', // U+2212, the minus sign a spreadsheet substitutes for a hyphen
    '٣', // Arabic-Indic digit
    '‮', // right-to-left override
    ' ',
    '0',
    '.',
] as const

const VALID_EXPORT = [
    'Date,Description,Category,Cost,Currency,Ana,Bruno,Carla',
    '2026-01-02,Dinner,Dining out,60.00,EUR,40.00,-20.00,-20.00',
    '2026-01-03,"Taxi, late",Transport,30.00,EUR,-10.00,20.00,-10.00',
    '2026-01-04,Museum,Entertainment,15.00,EUR,-5.00,-5.00,10.00',
    'Total balance,,,0.00,EUR,25.00,-5.00,-20.00',
    '',
].join('\n')

// ─── the contracts ───────────────────────────────────────────────────────────

/** Contract 2, checked on whatever came back. */
function assertCoherent(result: SplitwiseImport, label: string): void {
    const names = result.members.map((name) => name.toLowerCase())
    expect(`${label}:duplicate-names=${new Set(names).size !== names.length}`).toBe(`${label}:duplicate-names=false`)
    for (const name of result.members) {
        expect(name.length).toBeGreaterThan(0)
        expect(name.length).toBeLessThanOrEqual(MAX_NAME_CHARS)
    }

    for (const expense of result.expenses) {
        const cost = BigInt(expense.costMinor)
        expect(`${label}:${expense.description}:positive=${cost > 0n}`).toBe(
            `${label}:${expense.description}:positive=true`
        )
        const sum = expense.shares.reduce((total, share) => total + BigInt(share.amountMinor), 0n)
        expect(`${label}:${expense.description}:sum=${sum}`).toBe(`${label}:${expense.description}:sum=${cost}`)
        for (const share of expense.shares) {
            expect(BigInt(share.amountMinor) > 0n).toBe(true)
            expect(result.members).toContain(share.member)
        }
        expect(result.members).toContain(expense.paidBy)
        expect(expense.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS)
        expect(/^\d{4}-\d{2}-\d{2}$/.test(expense.date)).toBe(true)
        expect(Number.isNaN(Number(expense.costMinor))).toBe(false)
    }

    for (const warning of result.warnings) expect(typeof warning.code).toBe('string')
    expect(result.currencies.length).toBeGreaterThan(0)
    expect(result.currencies).toContain(result.suggestedCurrency)
}

/** Contract 1 + contract 2, in the one call every caller makes. */
function parseSafely(text: string, label: string): SplitwiseImport | null {
    try {
        const result = parseSplitwiseCsv(text)
        assertCoherent(result, label)
        return result
    } catch (error) {
        if (error instanceof SplitwiseParseError) return null
        throw new Error(`${label}: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`)
    }
}

describe('mutation fuzz — a real export, corrupted', () => {
    it('never fails in any way but a SplitwiseParseError, over 400 mutations', () => {
        let parsed = 0
        for (let seed = 1; seed <= 400; seed++) {
            const rng = mulberry32(seed)
            let text = VALID_EXPORT
            for (let edit = between(rng, 1, 6); edit > 0; edit--) {
                const at = between(rng, 0, Math.max(0, text.length - 1))
                const action = between(rng, 0, 2)
                if (action === 0) text = text.slice(0, at) + pick(rng, HOSTILE) + text.slice(at)
                else if (action === 1) text = text.slice(0, at) + text.slice(at + between(rng, 1, 20))
                else text = text.slice(0, at) + pick(rng, HOSTILE) + text.slice(at + 1)
            }
            if (parseSafely(text, `mutation-${seed}`)) parsed++
        }
        // Most mutations leave a readable file. A run where every one was refused would mean the
        // fuzzer stopped exercising the arithmetic.
        expect(parsed).toBeGreaterThan(100)
    })

    it('never fails on pure garbage either, over 300 random blobs', () => {
        for (let seed = 1; seed <= 300; seed++) {
            const rng = mulberry32(seed * 7919)
            const length = between(rng, 0, 400)
            let text = ''
            for (let index = 0; index < length; index++) {
                text += rng() < 0.4 ? pick(rng, HOSTILE) : String.fromCharCode(between(rng, 32, 0x2fff))
            }
            parseSafely(text, `garbage-${seed}`)
        }
    })

    it('never fails on a header carrying whatever a spreadsheet put in it', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const rng = mulberry32(seed * 104_729)
            const columns = Array.from({ length: between(rng, 0, 8) }, () => {
                let name = ''
                for (let index = between(rng, 0, 12); index > 0; index--) name += pick(rng, HOSTILE)
                return name
            })
            const text = [
                ['Date', 'Description', 'Category', 'Cost', 'Currency', ...columns].join(','),
                `2026-01-02,Dinner,Dining out,60.00,EUR${columns.map(() => ',0.00').join('')}`,
                '',
            ].join('\n')
            parseSafely(text, `header-${seed}`)
        }
    })
})

describe('files nobody meant to write', () => {
    const cases: [name: string, text: string][] = [
        ['an empty file', ''],
        ['a lone BOM', '﻿'],
        ['nothing but newlines', '\n\n\n\n'],
        ['nothing but a lone CR', '\r\r\r'],
        ['a header and nothing else', 'Date,Description,Category,Cost,Currency,Ana,Bruno\n'],
        [
            'a header and only a Total balance row',
            'Date,Description,Category,Cost,Currency,Ana,Bruno\nTotal balance,,,0.00,EUR,0.00,0.00\n',
        ],
        ['a header with no member columns', 'Date,Description,Category,Cost,Currency\n2026-01-02,Dinner,X,10.00,EUR\n'],
        [
            'an export truncated mid-quote',
            'Date,Description,Category,Cost,Currency,Ana,Bruno\n2026-01-02,"Dinner with a comma',
        ],
        [
            'a row whose member columns do not sum to zero',
            'Date,Description,Category,Cost,Currency,Ana,Bruno\n2026-01-02,Dinner,X,10.00,EUR,9.00,-2.00\n',
        ],
        [
            'a row where nobody is up',
            'Date,Description,Category,Cost,Currency,Ana,Bruno\n2026-01-02,Dinner,X,10.00,EUR,0.00,0.00\n',
        ],
        [
            'a row with a zero cost',
            'Date,Description,Category,Cost,Currency,Ana,Bruno\n2026-01-02,Dinner,X,0.00,EUR,5.00,-5.00\n',
        ],
        [
            'a row in a currency nobody carries',
            'Date,Description,Category,Cost,Currency,Ana,Bruno\n2026-01-02,Dinner,X,10.00,ZZZZZ,5.00,-5.00\n',
        ],
        [
            'a row whose amounts are words',
            'Date,Description,Category,Cost,Currency,Ana,Bruno\n2026-01-02,Dinner,X,ten euros,EUR,five,minus five\n',
        ],
        [
            'a row with fewer cells than the header',
            'Date,Description,Category,Cost,Currency,Ana,Bruno\n2026-01-02,Dinner\n',
        ],
        [
            'a row with more cells than the header',
            'Date,Description,Category,Cost,Currency,Ana,Bruno\n2026-01-02,Dinner,X,10.00,EUR,5.00,-5.00,7.00,9.00\n',
        ],
        [
            'a NUL in the middle of a description',
            'Date,Description,Category,Cost,Currency,Ana,Bruno\n2026-01-02,Din\u0000ner,X,10.00,EUR,5.00,-5.00\n',
        ],
        [
            'two members with the same name',
            'Date,Description,Category,Cost,Currency,Ana,Ana\n2026-01-02,Dinner,X,10.00,EUR,5.00,-5.00\n',
        ],
        [
            'a member column with a newline inside its quoted name',
            'Date,Description,Category,Cost,Currency,"An\na",Bruno\n2026-01-02,Dinner,X,10.00,EUR,5.00,-5.00\n',
        ],
        [
            'an indivisible amount split three ways',
            'Date,Description,Category,Cost,Currency,Ana,Bruno,Carla\n2026-01-02,Dinner,X,0.10,EUR,0.07,-0.03,-0.04\n',
        ],
        [
            'a zero-decimal currency with decimal-looking amounts',
            'Date,Description,Category,Cost,Currency,Ana,Bruno\n2026-01-02,Dinner,X,1000,JPY,500,-500\n',
        ],
        [
            'a single enormous field',
            `Date,Description,Category,Cost,Currency,Ana,Bruno\n2026-01-02,${'x'.repeat(50_000)},X,10.00,EUR,5.00,-5.00\n`,
        ],
    ]

    it.each(cases)('survives %s', (_name, text) => {
        parseSafely(text, _name)
    })

    it('refuses a file whose every row it had to drop, rather than making an empty room', () => {
        const text = [
            'Date,Description,Category,Cost,Currency,Ana,Bruno',
            '2026-01-02,Dinner,X,10.00,EUR,9.00,-2.00',
            '2026-01-03,Taxi,X,10.00,EUR,0.00,0.00',
            '',
        ].join('\n')
        expect(() => parseSplitwiseCsv(text)).toThrow(SplitwiseParseError)
    })
})

describe('parseCsvRows rejects only structurally truncated CSV', () => {
    it('returns a grid or a typed unterminated-quote error for any input', () => {
        for (let seed = 1; seed <= 400; seed++) {
            const rng = mulberry32(seed * 31)
            let text = ''
            for (let index = between(rng, 0, 200); index > 0; index--) {
                text += rng() < 0.5 ? pick(rng, HOSTILE) : String.fromCharCode(between(rng, 32, 0x1fff))
            }
            try {
                const rows = parseCsvRows(text)
                expect(Array.isArray(rows)).toBe(true)
                expect(rows.length).toBeGreaterThan(0)
                for (const row of rows) for (const cell of row) expect(typeof cell).toBe('string')
            } catch (error) {
                expect(error).toBeInstanceOf(SplitwiseParseError)
                expect((error as SplitwiseParseError).code).toBe('MALFORMED_CSV')
            }
        }
    })

    it('keeps readable quote shapes and refuses an unterminated field', () => {
        expect(parseCsvRows('a,"b,c",d')).toEqual([['a', 'b,c', 'd']])
        expect(() => parseCsvRows('a,"unterminated')).toThrowError(
            expect.objectContaining<Partial<SplitwiseParseError>>({ code: 'MALFORMED_CSV' })
        )
        expect(parseCsvRows('a,b"c,d')).toEqual([['a', 'b"c', 'd']])
        expect(parseCsvRows('\r\n')).toEqual([[''], ['']])
    })
})
