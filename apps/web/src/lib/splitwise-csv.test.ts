import { describe, expect, it } from 'vitest'
import {
    MAX_EXPENSES,
    SplitwiseParseError,
    allocateProportionally,
    intersectAllocation,
    parseCsvRows,
    parseSignedMinor,
    parseSplitwiseCsv,
    roomNameFromFilename,
    type ParsedExpense,
    type SplitwiseImport,
} from '@/lib/splitwise-csv'
import {
    GARBAGE,
    LOCALISED_DECIMALS,
    MESSY_GROUP,
    MULTI_CURRENCY,
    MULTI_PAYER,
    QUOTED_FIELDS,
    SIMPLE_GROUP,
    WITH_PAYMENTS,
    WRONG_CSV,
    generateGroup,
} from '@/lib/__fixtures__/splitwise'

const codes = (result: SplitwiseImport) => result.warnings.map((w) => w.code)

/** The invariant every expense must hold on its own: shares reconstruct the total. */
const sharesSumToCost = (expense: ParsedExpense) =>
    expense.shares.reduce((a, s) => a + BigInt(s.amountMinor), 0n) === BigInt(expense.costMinor)

/** Fold the parsed expenses the way Split's own `balancesOf` does: paid, minus your share. This
 *  is the number the file's "Total balance" row claims, computed from what we are about to write. */
function foldBalances(result: SplitwiseImport): Map<string, bigint> {
    const net = new Map(result.members.map((m) => [m, 0n]))
    const bump = (member: string, delta: bigint) => net.set(member, (net.get(member) ?? 0n) + delta)
    for (const expense of result.expenses) {
        bump(expense.paidBy, BigInt(expense.costMinor))
        for (const share of expense.shares) bump(share.member, -BigInt(share.amountMinor))
    }
    return net
}

describe('parseCsvRows — RFC 4180', () => {
    it('splits plain rows on commas and newlines', () => {
        expect(parseCsvRows('a,b\nc,d\n')).toEqual([['a', 'b'], ['c', 'd'], ['']])
    })

    it('keeps commas that are inside a quoted field', () => {
        expect(parseCsvRows('a,"b,c",d')).toEqual([['a', 'b,c', 'd']])
    })

    it('unescapes doubled quotes', () => {
        expect(parseCsvRows('"she said ""hi"""')).toEqual([['she said "hi"']])
    })

    it('keeps a newline that is inside a quoted field', () => {
        expect(parseCsvRows('"line one\nline two",b')).toEqual([['line one\nline two', 'b']])
    })

    it('handles CRLF line endings', () => {
        expect(parseCsvRows('a,b\r\nc,d')).toEqual([
            ['a', 'b'],
            ['c', 'd'],
        ])
    })

    it('strips a UTF-8 BOM so the first header cell still matches', () => {
        expect(parseCsvRows('﻿Date,Cost')).toEqual([['Date', 'Cost']])
    })

    it('keeps empty cells rather than collapsing them', () => {
        expect(parseCsvRows('a,,c')).toEqual([['a', '', 'c']])
    })

    it('treats a quote that opens mid-field as data', () => {
        expect(parseCsvRows('a"b",c')).toEqual([['a"b"', 'c']])
    })
})

describe('parseSignedMinor', () => {
    it('reads a plain two-decimal amount', () => {
        expect(parseSignedMinor('12.34', 2)).toBe(1234n)
    })

    it('reads a negative amount', () => {
        expect(parseSignedMinor('-12.34', 2)).toBe(-1234n)
    })

    it('reads comma decimals', () => {
        expect(parseSignedMinor('-617,28', 2)).toBe(-61728n)
    })

    it('reads dot grouping with a comma decimal', () => {
        expect(parseSignedMinor('1.234,56', 2)).toBe(123456n)
    })

    it('reads comma grouping with a dot decimal', () => {
        expect(parseSignedMinor('1,234.56', 2)).toBe(123456n)
    })

    it('respects a zero-decimal currency', () => {
        expect(parseSignedMinor('1234', 0)).toBe(1234n)
    })

    it('treats an empty cell as zero', () => {
        expect(parseSignedMinor('', 2)).toBe(0n)
    })

    it('strips a currency symbol a spreadsheet added', () => {
        expect(parseSignedMinor('€ 12.34', 2)).toBe(1234n)
    })

    it('refuses an amount whose separators cannot be read', () => {
        expect(parseSignedMinor('1.234.567', 2)).toBeNull()
    })

    it('refuses a word', () => {
        expect(parseSignedMinor('n/a', 2)).toBeNull()
    })
})

describe('allocateProportionally', () => {
    it('sums to the total when the split is not clean', () => {
        const parts = allocateProportionally(100n, [1n, 1n, 1n])
        expect(parts.reduce((a, p) => a + p, 0n)).toBe(100n)
        expect(parts).toEqual([34n, 33n, 33n])
    })

    it('is exact when the weights divide evenly', () => {
        expect(allocateProportionally(900n, [300n, 300n])).toEqual([450n, 450n])
    })

    it('gives nothing away when every weight is zero', () => {
        expect(allocateProportionally(100n, [0n, 0n])).toEqual([0n, 0n])
    })
})

describe('intersectAllocation', () => {
    it('produces a grid whose rows and columns both add up', () => {
        const rows = [450n, 450n]
        const columns = [150n, 150n, 600n]
        const grid = intersectAllocation(rows, columns)

        rows.forEach((total, r) => expect(grid[r].reduce((a, c) => a + c, 0n)).toBe(total))
        columns.forEach((total, c) => expect(grid.reduce((a, row) => a + row[c], 0n)).toBe(total))
    })

    it('holds for awkward totals', () => {
        const rows = [1n, 97n, 2n]
        const columns = [33n, 33n, 34n]
        const grid = intersectAllocation(rows, columns)

        rows.forEach((total, r) => expect(grid[r].reduce((a, c) => a + c, 0n)).toBe(total))
        columns.forEach((total, c) => expect(grid.reduce((a, row) => a + row[c], 0n)).toBe(total))
    })
})

describe('parseSplitwiseCsv — the simple group', () => {
    const result = parseSplitwiseCsv(SIMPLE_GROUP)

    it('reads the roster off the header', () => {
        expect(result.members).toEqual(['Ana', 'Bruno', 'Carla'])
    })

    it('drops the Total balance row from the expenses and keeps it as the check', () => {
        expect(result.expenses).toHaveLength(3)
        expect(result.totalBalance).toEqual([
            { member: 'Ana', netMinor: '1500' },
            { member: 'Bruno', netMinor: '-1500' },
            { member: 'Carla', netMinor: '0' },
        ])
    })

    it('derives the payer from the one positive column', () => {
        expect(result.expenses.map((e) => e.paidBy)).toEqual(['Ana', 'Bruno', 'Carla'])
    })

    it('derives every share, payer included', () => {
        const dinner = result.expenses[0]
        expect(dinner.costMinor).toBe('6000')
        expect(dinner.shares).toEqual([
            { member: 'Ana', amountMinor: '2000' },
            { member: 'Bruno', amountMinor: '2000' },
            { member: 'Carla', amountMinor: '2000' },
        ])
    })

    it('keeps the expense date and category', () => {
        expect(result.expenses[0].date).toBe('2026-01-02')
        expect(result.expenses[0].category).toBe('Dining out')
    })

    it('suggests the only currency in the file', () => {
        expect(result.suggestedCurrency).toBe('EUR')
        expect(result.currencies).toEqual(['EUR'])
    })

    it('parses clean', () => {
        expect(result.warnings).toEqual([])
    })
})

describe('parseSplitwiseCsv — quoted fields', () => {
    const result = parseSplitwiseCsv(QUOTED_FIELDS)

    it('keeps a description containing a comma intact', () => {
        expect(result.expenses[0].description).toBe('Dinner, drinks and a taxi')
    })

    it('keeps a description containing escaped quotes intact', () => {
        expect(result.expenses[1].description).toBe(`She said "it's on me"`)
    })

    it('reads a quoted amount', () => {
        expect(result.expenses[0].costMinor).toBe('5000')
    })
})

describe('parseSplitwiseCsv — localised decimals', () => {
    const result = parseSplitwiseCsv(LOCALISED_DECIMALS)

    it('reads dot-grouped comma decimals', () => {
        expect(result.expenses[0].costMinor).toBe('123456')
        expect(result.expenses[0].shares).toEqual([
            { member: 'Ana', amountMinor: '61728' },
            { member: 'Bruno', amountMinor: '61728' },
        ])
    })
})

describe('parseSplitwiseCsv — multi-payer rows', () => {
    const result = parseSplitwiseCsv(MULTI_PAYER)

    it('splits the row into one expense per payer and says so', () => {
        expect(result.expenses).toHaveLength(2)
        expect(result.expenses.map((e) => e.paidBy)).toEqual(['Ana', 'Bruno'])
        expect(codes(result)).toContain('MULTI_PAYER_SPLIT')
    })

    it('labels the parts so they do not read as duplicates', () => {
        expect(result.expenses.map((e) => e.description)).toEqual(['Villa deposit (1/2)', 'Villa deposit (2/2)'])
    })

    it('keeps the row total whole across the parts', () => {
        const total = result.expenses.reduce((a, e) => a + BigInt(e.costMinor), 0n)
        expect(total).toBe(90000n)
    })

    it('reproduces every net the file states', () => {
        const balances = foldBalances(result)
        expect(balances.get('Ana')).toBe(30000n)
        expect(balances.get('Bruno')).toBe(30000n)
        expect(balances.get('Carla')).toBe(-60000n)
    })
})

describe('parseSplitwiseCsv — payments and multi-currency', () => {
    it('imports a settle-up row as a balance-identical expense and flags it', () => {
        const result = parseSplitwiseCsv(WITH_PAYMENTS)
        expect(codes(result)).toContain('PAYMENT_ROWS')
        const balances = foldBalances(result)
        expect(balances.get('Ana')).toBe(0n)
        expect(balances.get('Bruno')).toBe(0n)
    })

    it('keeps each expense in its own currency and warns that FX is involved', () => {
        const result = parseSplitwiseCsv(MULTI_CURRENCY)
        expect(result.expenses.map((e) => e.currencyCode)).toEqual(['EUR', 'EUR', 'CHF'])
        expect(result.currencies.sort()).toEqual(['CHF', 'EUR'])
        expect(codes(result)).toContain('MIXED_CURRENCY')
    })

    it('suggests the currency most rows are in', () => {
        expect(parseSplitwiseCsv(MULTI_CURRENCY).suggestedCurrency).toBe('EUR')
    })
})

describe('parseSplitwiseCsv — hostile and messy input', () => {
    const result = parseSplitwiseCsv(MESSY_GROUP)

    it('finds a header that is not on the first line', () => {
        expect(result.members).toEqual(['Ana', 'Bruno'])
    })

    it('keeps the rows it can read', () => {
        expect(result.expenses.map((e) => e.description)).toEqual(['Dinner', 'Lunch'])
    })

    it('names every row it dropped, with the line number', () => {
        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ code: 'ROW_UNBALANCED', row: 7 }),
                expect.objectContaining({ code: 'ROW_UNSUPPORTED_CURRENCY', row: 8, detail: 'INR' }),
                expect.objectContaining({ code: 'ROW_ZERO_COST', row: 9 }),
            ])
        )
    })

    it('still reconciles to the balance row using only the rows it kept', () => {
        const balances = foldBalances(result)
        expect(balances.get('Ana')).toBe(1000n)
        expect(balances.get('Bruno')).toBe(-1000n)
        expect(result.totalBalance).toEqual([
            { member: 'Ana', netMinor: '1000' },
            { member: 'Bruno', netMinor: '-1000' },
        ])
    })

    it('refuses a file that is not a Splitwise export', () => {
        expect(() => parseSplitwiseCsv(GARBAGE)).toThrow(SplitwiseParseError)
        expect(() => parseSplitwiseCsv(GARBAGE)).toThrow(/NOT_SPLITWISE_CSV/)
    })

    it('refuses a CSV from something else entirely', () => {
        expect(() => parseSplitwiseCsv(WRONG_CSV)).toThrow(/NOT_SPLITWISE_CSV/)
    })

    it('refuses an empty file', () => {
        expect(() => parseSplitwiseCsv('')).toThrow(/NOT_SPLITWISE_CSV/)
    })

    it('refuses a header with no member columns', () => {
        expect(() => parseSplitwiseCsv('Date,Description,Category,Cost,Currency\n')).toThrow(/NO_MEMBERS/)
    })

    it('refuses a file where nothing survived', () => {
        const nothing = 'Date,Description,Category,Cost,Currency,Ana,Bruno\n2026-01-01,X,Y,0.00,EUR,0.00,0.00\n'
        expect(() => parseSplitwiseCsv(nothing)).toThrow(/NO_EXPENSES/)
    })

    it('disambiguates two members with the same display name', () => {
        const twoAnas = 'Date,Description,Category,Cost,Currency,Ana,Ana\n2026-01-01,X,Y,10.00,EUR,5.00,-5.00\n'
        const parsed = parseSplitwiseCsv(twoAnas)
        expect(parsed.members).toEqual(['Ana', 'Ana (2)'])
        expect(codes(parsed)).toContain('DUPLICATE_MEMBER_NAME')
    })

    it('falls back to today when a date will not parse, and says so', () => {
        const badDate = 'Date,Description,Category,Cost,Currency,Ana,Bruno\nnot a date,X,Y,10.00,EUR,5.00,-5.00\n'
        const parsed = parseSplitwiseCsv(badDate)
        expect(codes(parsed)).toContain('ROW_BAD_DATE')
        expect(parsed.expenses[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('falls back to the category when the description is blank', () => {
        const blank = 'Date,Description,Category,Cost,Currency,Ana,Bruno\n2026-01-01,,Groceries,10.00,EUR,5.00,-5.00\n'
        expect(parseSplitwiseCsv(blank).expenses[0].description).toBe('Groceries')
    })
})

describe('parseSplitwiseCsv — caps', () => {
    it('accepts a file at the expense ceiling', () => {
        expect(parseSplitwiseCsv(generateGroup(MAX_EXPENSES)).expenses).toHaveLength(MAX_EXPENSES)
    })

    it('refuses one expense past it', () => {
        expect(() => parseSplitwiseCsv(generateGroup(MAX_EXPENSES + 1))).toThrow(/TOO_MANY_EXPENSES/)
    })

    it('refuses a group bigger than a room', () => {
        const names = Array.from({ length: 21 }, (_, i) => `P${i}`)
        expect(() => parseSplitwiseCsv(generateGroup(1, names))).toThrow(/TOO_MANY_MEMBERS/)
    })

    it('refuses a file too big to be one of these', () => {
        expect(() => parseSplitwiseCsv('x'.repeat(1_000_001))).toThrow(/FILE_TOO_BIG/)
    })
})

describe('every parsed expense reconstructs its own total', () => {
    const files = {
        SIMPLE_GROUP,
        MULTI_CURRENCY,
        MULTI_PAYER,
        QUOTED_FIELDS,
        LOCALISED_DECIMALS,
        WITH_PAYMENTS,
        MESSY_GROUP,
    }

    for (const [name, csv] of Object.entries(files)) {
        it(`${name}: shares sum to cost on every expense`, () => {
            const result = parseSplitwiseCsv(csv)
            expect(result.expenses.length).toBeGreaterThan(0)
            for (const expense of result.expenses) expect(sharesSumToCost(expense)).toBe(true)
        })
    }

    it('holds for a generated group of every size up to 40', () => {
        for (let n = 1; n <= 40; n++) {
            const result = parseSplitwiseCsv(generateGroup(n, ['Ana', 'Bruno', 'Carla']))
            expect(result.expenses).toHaveLength(n)
            for (const expense of result.expenses) expect(sharesSumToCost(expense)).toBe(true)
        }
    })

    it('holds for every group size, where the remainder never divides cleanly', () => {
        for (let people = 2; people <= 12; people++) {
            const names = Array.from({ length: people }, (_, i) => `P${i}`)
            const result = parseSplitwiseCsv(generateGroup(3, names))
            for (const expense of result.expenses) expect(sharesSumToCost(expense)).toBe(true)
        }
    })
})

describe('the parsed expenses reproduce the file’s own Total balance row', () => {
    const files = { SIMPLE_GROUP, MULTI_PAYER, QUOTED_FIELDS, LOCALISED_DECIMALS, WITH_PAYMENTS, MESSY_GROUP }

    for (const [name, csv] of Object.entries(files)) {
        it(`${name}: every member's net matches`, () => {
            const result = parseSplitwiseCsv(csv)
            expect(result.totalBalance).not.toBeNull()
            const folded = foldBalances(result)
            for (const stated of result.totalBalance ?? []) {
                expect(`${stated.member}=${folded.get(stated.member)}`).toBe(`${stated.member}=${stated.netMinor}`)
            }
        })
    }
})

describe('roomNameFromFilename', () => {
    it('turns an export filename into a room name', () => {
        expect(roomNameFromFilename('ski_trip_2026.csv')).toBe('ski trip 2026')
    })

    it('drops the date tail Splitwise appends', () => {
        expect(roomNameFromFilename('Ski trip_2026-07-28.csv')).toBe('Ski trip')
    })

    it('never returns an empty name', () => {
        expect(roomNameFromFilename('.csv')).toBe('')
    })
})
