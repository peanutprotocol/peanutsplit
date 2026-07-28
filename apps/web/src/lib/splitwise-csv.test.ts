import { describe, expect, it } from 'vitest'
import { CURRENCIES, convertMinorAtRate } from '@/server/money'
import { exactShares } from '@/server/split'
import { importRoomSchema } from '@/server/validation'
import {
    MAX_CATEGORY_CHARS,
    MAX_DESCRIPTION_CHARS,
    MAX_EXPENSES,
    MAX_NAME_CHARS,
    MAX_PARSED_EXPENSES,
    BROUGHT_FORWARD,
    SplitwiseParseError,
    allocateProportionally,
    intersectAllocation,
    isEvenSplit,
    openingBalance,
    parseCsvRows,
    parseSignedMinor,
    parseSplitwiseCsv,
    reconcileTotalBalance,
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
    generateLongHistory,
} from '@/lib/__fixtures__/splitwise'

const codes = (result: SplitwiseImport) => result.warnings.map((w) => w.code)

/** Absolute nets, for the cases that assert an actual number rather than agreement with the
 *  file's own summary row — that comparison goes through `reconcileTotalBalance`. */
function foldBalances(result: SplitwiseImport): Map<string, bigint> {
    const net = new Map(result.members.map((m) => [m, 0n]))
    const bump = (member: string, delta: bigint) => net.set(member, (net.get(member) ?? 0n) + delta)
    for (const expense of result.expenses) {
        bump(expense.paidBy, BigInt(expense.costMinor))
        for (const share of expense.shares) bump(share.member, -BigInt(share.amountMinor))
    }
    return net
}

/** The invariant every expense must hold on its own: shares reconstruct the total. */
const sharesSumToCost = (expense: ParsedExpense) =>
    expense.shares.reduce((a, s) => a + BigInt(s.amountMinor), 0n) === BigInt(expense.costMinor)

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

    it('carries the overflow instead of refusing the file', () => {
        const parsed = parseSplitwiseCsv(generateGroup(MAX_EXPENSES + 1))
        expect(parsed.expenses.length).toBeLessThanOrEqual(MAX_EXPENSES)
        expect(codes(parsed)).toContain('TRUNCATED_HISTORY')
    })

    it('still refuses a file too big to be a group export at all', () => {
        expect(() => parseSplitwiseCsv(generateGroup(MAX_PARSED_EXPENSES + 1))).toThrow(
            /TOO_MANY_EXPENSES|FILE_TOO_BIG/
        )
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
            // Through the same function the preview screen uses, so what the user is told and
            // what this suite asserts are the same computation.
            expect(reconcileTotalBalance(result)).toEqual([])
        })
    }

    it('is not attempted for a mixed-currency file, where the row could not mean anything', () => {
        expect(reconcileTotalBalance(parseSplitwiseCsv(MULTI_CURRENCY))).toBeNull()
    })

    it('names every member whose net drifted when rows had to be dropped', () => {
        // Bruno's row does not sum to zero, so it is skipped — and the summary row at the bottom
        // still counts it. That is exactly the disagreement the preview has to admit to.
        const csv = [
            'Date,Description,Category,Cost,Currency,Ana,Bruno',
            '2026-01-02,Dinner,Dining out,60.00,EUR,30.00,-30.00',
            '2026-01-03,Taxi,Transportation,20.00,EUR,20.00,-15.00',
            'Total balance,,,0.00,EUR,35.00,-35.00',
        ].join('\n')

        const result = parseSplitwiseCsv(csv)
        expect(codes(result)).toContain('ROW_UNBALANCED')
        const drift = reconcileTotalBalance(result)
        expect(drift?.map((entry) => entry.member).sort()).toEqual(['Ana', 'Bruno'])
        expect(drift?.every((entry) => entry.deltaMinor !== '0')).toBe(true)
    })
})

/**
 * The preview has to promise only what the POST accepts. Splitwise has no length limits of its
 * own, so a real export can carry a description, a category or a member name past Split's
 * ceilings — and before this the preview showed a clean room, the POST answered a bare
 * `VALIDATION_ERROR`, and there was no row number anywhere to say which one.
 *
 * Every case here ends by feeding the parsed result through the actual schema, because "we
 * truncated it" is only interesting if the result is a payload the server takes.
 */
describe('field ceilings the POST would otherwise refuse', () => {
    const payloadFor = (result: SplitwiseImport) => ({
        roomName: 'Imported group',
        emoji: '🧾',
        currency: result.suggestedCurrency,
        creatorName: result.members[0],
        members: result.members,
        expenses: result.expenses,
    })

    const accepted = (result: SplitwiseImport) => importRoomSchema.safeParse(payloadFor(result)).success

    const oneRow = (description: string, category = 'Dining out', members = 'Ana,Bruno') =>
        `Date,Description,Category,Cost,Currency,${members}\n2026-01-02,"${description}","${category}",60.00,EUR,30.00,-30.00\n`

    it('shortens a description past the ceiling and says so', () => {
        const result = parseSplitwiseCsv(oneRow('x'.repeat(400)))
        expect(codes(result)).toContain('ROW_DESCRIPTION_TRUNCATED')
        expect(result.expenses[0].description.length).toBe(MAX_DESCRIPTION_CHARS)
        expect(accepted(result)).toBe(true)
    })

    /**
     * The nasty one. A 253-character description is legal on its own, and the multi-payer path
     * appends " (1/2)" AFTER the check — so a row that passed the preview arrived six characters
     * over and took the entire import down with it.
     */
    it('leaves room for the multi-payer suffix rather than blowing the ceiling with it', () => {
        const description = 'y'.repeat(MAX_DESCRIPTION_CHARS - 2)
        const csv = `Date,Description,Category,Cost,Currency,Ana,Bruno,Carla\n2026-01-02,"${description}",Dining out,60.00,EUR,20.00,10.00,-30.00\n`
        const result = parseSplitwiseCsv(csv)

        expect(result.expenses.length).toBeGreaterThan(1)
        for (const expense of result.expenses) {
            expect(expense.description.endsWith(`/${result.expenses.length})`)).toBe(true)
            expect(expense.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS)
        }
        expect(accepted(result)).toBe(true)
    })

    it('shortens a member name past the ceiling and says so', () => {
        const long = 'N'.repeat(90)
        const result = parseSplitwiseCsv(oneRow('Dinner', 'Dining out', `${long},Bruno`))
        expect(codes(result)).toContain('MEMBER_NAME_TRUNCATED')
        expect(result.members[0].length).toBe(MAX_NAME_CHARS)
        expect(accepted(result)).toBe(true)
    })

    /** Cut before dedupe, never after: two long names that differ only past the ceiling would
     *  otherwise truncate into the same string and be refused as a duplicate roster. */
    it('does not manufacture a duplicate out of two names that differ past the ceiling', () => {
        const base = 'N'.repeat(MAX_NAME_CHARS)
        const result = parseSplitwiseCsv(oneRow('Dinner', 'Dining out', `${base}aaa,${base}bbb`))
        expect(new Set(result.members.map((name) => name.toLowerCase())).size).toBe(2)
        expect(result.members.every((name) => name.length <= MAX_NAME_CHARS)).toBe(true)
        expect(accepted(result)).toBe(true)
    })

    it('shortens a category past the ceiling and says so', () => {
        const result = parseSplitwiseCsv(oneRow('Dinner', 'C'.repeat(41)))
        expect(codes(result)).toContain('ROW_CATEGORY_TRUNCATED')
        expect(result.expenses[0].category?.length).toBe(MAX_CATEGORY_CHARS)
        expect(accepted(result)).toBe(true)
    })

    it('leaves a file that was already inside every ceiling completely alone', () => {
        const result = parseSplitwiseCsv(SIMPLE_GROUP)
        expect(codes(result)).not.toContain('ROW_DESCRIPTION_TRUNCATED')
        expect(codes(result)).not.toContain('ROW_CATEGORY_TRUNCATED')
        expect(codes(result)).not.toContain('MEMBER_NAME_TRUNCATED')
    })
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

describe('recognising an even split', () => {
    it('reads a clean division as EQUAL', () => {
        expect(isEvenSplit(6000n, [2000n, 2000n, 2000n])).toBe(true)
    })

    it('reads a division with its rounding residue as EQUAL, wherever the residue landed', () => {
        expect(isEvenSplit(10000n, [3334n, 3333n, 3333n])).toBe(true)
        expect(isEvenSplit(10000n, [3333n, 3333n, 3334n])).toBe(true)
    })

    it('refuses numbers somebody chose', () => {
        expect(isEvenSplit(10000n, [5000n, 3000n, 2000n])).toBe(false)
        // Two apart is not a rounding residue, it is a decision.
        expect(isEvenSplit(6000n, [2001n, 2000n, 1999n])).toBe(false)
    })

    it('refuses a single share — one person carrying one cost is not a split', () => {
        expect(isEvenSplit(6000n, [6000n])).toBe(false)
        expect(isEvenSplit(0n, [])).toBe(false)
    })

    it('labels the rows of a real export', () => {
        const parsed = parseSplitwiseCsv(SIMPLE_GROUP)
        // Every row of the simple group is a clean three-way split.
        expect(parsed.expenses.map((expense) => expense.splitMode)).toEqual(['EQUAL', 'EQUAL', 'EQUAL'])

        // Ana fronts 100.00; Bruno owes 30, Carla owes 20, Ana carries 50. Three
        // numbers somebody decided on, and the room has to keep them.
        const uneven = parseSplitwiseCsv(
            'Date,Description,Category,Cost,Currency,Ana,Bruno,Carla\n2026-01-01,Dinner,Food,100.00,EUR,50.00,-30.00,-20.00\n'
        )
        expect(uneven.expenses[0].splitMode).toBe('EXACT')
        expect(uneven.expenses[0].shares.map((share) => share.amountMinor)).toEqual(['5000', '3000', '2000'])
    })
})

/** Every member's net over a list of expenses, in the currency the rows are in. */
const fileNets = (expenses: readonly ParsedExpense[]): Map<string, bigint> => {
    const net = new Map<string, bigint>()
    const bump = (member: string, delta: bigint) => net.set(member, (net.get(member) ?? 0n) + delta)
    for (const expense of expenses) {
        bump(expense.paidBy, BigInt(expense.costMinor))
        for (const share of expense.shares) bump(share.member, -BigInt(share.amountMinor))
    }
    return net
}

/** A room that settles in something the group never spent. THB is 2-decimal like
 *  EUR, so the rate is the only thing moving — not a decimals change as well. */
const ROOM_CURRENCY = 'THB'
const EUR_TO_THB = rateOf('EUR') / rateOf('THB')

function rateOf(code: string): number {
    // What `rateFrom` does with the static table, without dragging Prisma into a
    // pure test through `server/fx`.
    return CURRENCIES.find((c) => c.code === code)!.usdPerUnit
}

/**
 * The importer's arithmetic in miniature, and it has to be the importer's: total
 * converted once, each share converted on its own, the residue pushed onto the
 * largest — which is `buildExpense` in EXACT mode, the single path every imported
 * row takes (`server/splitwiseImport.ts`). Reimplementing it as "convert the
 * shares and add them up" would test a rounding rule the product does not use.
 */
const roomNets = (expenses: readonly ParsedExpense[]): Map<string, bigint> => {
    const net = new Map<string, bigint>()
    const bump = (member: string, delta: bigint) => net.set(member, (net.get(member) ?? 0n) + delta)
    for (const expense of expenses) {
        const total = convertMinorAtRate(BigInt(expense.costMinor), expense.currencyCode, ROOM_CURRENCY, EUR_TO_THB)
        bump(expense.paidBy, total)
        const shares = exactShares(
            expense.shares.map((share) => ({ memberId: share.member, amountMinor: BigInt(share.amountMinor) })),
            expense.currencyCode,
            ROOM_CURRENCY,
            total,
            EUR_TO_THB
        )
        for (const share of shares) bump(share.memberId, -share.amountMinor)
    }
    return net
}

describe('carrying history a room cannot hold', () => {
    const MEMBERS = ['Ana', 'Bruno', 'Carla', 'Dan']

    it('keeps the most recent expenses and rolls the rest into an opening balance', () => {
        const parsed = parseSplitwiseCsv(generateLongHistory(700, MEMBERS))

        expect(parsed.expenses.length).toBeLessThanOrEqual(MAX_EXPENSES)
        expect(codes(parsed)).toContain('TRUNCATED_HISTORY')

        const carried = parsed.expenses.filter((expense) => expense.description.startsWith(BROUGHT_FORWARD))
        expect(carried.length).toBeGreaterThan(0)
        // At most one row per pair per currency, which is n − 1 at the very worst.
        expect(carried.length).toBeLessThanOrEqual(MEMBERS.length - 1)
        // A carried row is a ledger entry, never a division: one share, and it
        // must not be something a later catch-up could spread across the room.
        expect(carried.every((expense) => expense.splitMode === 'EXACT')).toBe(true)
        expect(carried.every((expense) => expense.shares.length === 1)).toBe(true)

        const history = parsed.expenses.filter((expense) => !expense.description.startsWith(BROUGHT_FORWARD))
        // The newest survived; the oldest did not.
        expect(history.some((expense) => expense.description === 'Expense 700')).toBe(true)
        expect(history.some((expense) => expense.description === 'Expense 1')).toBe(false)
    })

    /**
     * THE proof. Every member's balance in the room we are about to write must
     * equal the number in the file's own "Total balance" row, to the cent, even
     * though two hundred of the rows behind it were never imported.
     */
    it('reproduces the file’s own total balance row exactly', () => {
        const parsed = parseSplitwiseCsv(generateLongHistory(700, MEMBERS))
        expect(reconcileTotalBalance(parsed)).toEqual([])
    })

    it('holds for a roster size that leaves a remainder in the pairing', () => {
        for (const size of [2, 3, 5, 7]) {
            const members = Array.from({ length: size }, (_, i) => `P${i}`)
            const parsed = parseSplitwiseCsv(generateLongHistory(MAX_EXPENSES + 137, members))
            expect(parsed.expenses.length).toBeLessThanOrEqual(MAX_EXPENSES)
            expect(reconcileTotalBalance(parsed)).toEqual([])
        }
    })

    /**
     * The room-currency half of the brought-forward claim, which the file-currency
     * proofs above cannot see: a room that settles in something other than what the
     * group spent converts every row on the way in (`buildExpense`), and conversion
     * rounds. The carried rows round ONCE per pair where the history they replace
     * rounded once per dropped row, so the two cannot be the same integer — and the
     * question is how far apart they are allowed to be.
     *
     * The bound, derived rather than guessed. A member is a debtor or a creditor in
     * the pairing, never both, so their carried room-currency net is a sum of at
     * most `n − 1` converted transfers, each within half a minor unit of its exact
     * value; the ideal they are compared against — the whole residual converted in
     * one go — is itself within half a unit. That is `n / 2`, and the assertion uses
     * the rounder `n` so the pairing can change without this becoming a trap. What
     * it is NOT is a function of how much history was folded away: a thousand
     * dropped rows and ten are the same bound, which is the entire point of folding.
     *
     * Cost 40.01 across 7 people, so every row of the file carries a residue too,
     * and the room is in THB while the file is in EUR.
     */
    it('bounds a foreign-currency room by the roster, and still nets to zero', () => {
        const members = ['Ana', 'Bruno', 'Carla', 'Dan', 'Eve', 'Fran', 'Gus']
        const parsed = parseSplitwiseCsv(generateLongHistory(MAX_EXPENSES + 137, members, 4001))
        const carried = parsed.expenses.filter((expense) => expense.description.startsWith(BROUGHT_FORWARD))
        expect(carried.length).toBeGreaterThan(0)
        expect(parsed.expenses.length).toBeLessThanOrEqual(MAX_EXPENSES)

        // What the dropped rows were worth, in the file's own currency: the file's
        // summary row minus what survived the cut. Exact, and it never needs the
        // dropped rows themselves.
        const kept = parsed.expenses.filter((expense) => !expense.description.startsWith(BROUGHT_FORWARD))
        const keptNet = fileNets(kept)
        const stated = new Map((parsed.totalBalance ?? []).map((row) => [row.member, BigInt(row.netMinor)]))
        const droppedNet = new Map(members.map((m) => [m, (stated.get(m) ?? 0n) - (keptNet.get(m) ?? 0n)]))

        const carriedNet = roomNets(carried)
        for (const member of members) {
            // The ideal: one conversion of the whole residual, no intermediate rounding.
            const ideal = convertMinorAtRate(droppedNet.get(member) ?? 0n, 'EUR', ROOM_CURRENCY, EUR_TO_THB)
            const drift = (carriedNet.get(member) ?? 0n) - ideal
            expect(drift < 0n ? -drift : drift).toBeLessThanOrEqual(BigInt(members.length))
        }

        // Rounding moved cents between people; it cannot have created any. Every
        // carried row moves one integer from a debtor to a creditor, so the room —
        // opening balance and surviving history alike — still sums to zero.
        expect([...carriedNet.values()].reduce((a, b) => a + b, 0n)).toBe(0n)
        expect([...roomNets(parsed.expenses).values()].reduce((a, b) => a + b, 0n)).toBe(0n)
    })

    it('is the same room twice — the cut and the pairing are deterministic', () => {
        const file = generateLongHistory(640, MEMBERS)
        expect(parseSplitwiseCsv(file).expenses).toEqual(parseSplitwiseCsv(file).expenses)
    })

    it('leaves a file inside the ceiling completely untouched', () => {
        const parsed = parseSplitwiseCsv(generateLongHistory(120, MEMBERS))
        expect(parsed.expenses).toHaveLength(120)
        expect(codes(parsed)).not.toContain('TRUNCATED_HISTORY')
        expect(parsed.expenses.some((expense) => expense.description.startsWith(BROUGHT_FORWARD))).toBe(false)
    })

    it('carries each currency on its own, because a residual in one is not a residual in another', () => {
        const dropped: ParsedExpense[] = [
            {
                date: '2026-01-01',
                description: 'Old EUR',
                category: null,
                currencyCode: 'EUR',
                costMinor: '1000',
                paidBy: 'Ana',
                splitMode: 'EQUAL',
                shares: [{ member: 'Bruno', amountMinor: '1000' }],
            },
            {
                date: '2026-01-02',
                description: 'Old CHF',
                category: null,
                currencyCode: 'CHF',
                costMinor: '500',
                paidBy: 'Bruno',
                splitMode: 'EQUAL',
                shares: [{ member: 'Ana', amountMinor: '500' }],
            },
        ]

        const carried = openingBalance(dropped)

        expect(carried).toHaveLength(2)
        expect(carried.map((expense) => expense.currencyCode).sort()).toEqual(['CHF', 'EUR'])
        // Nothing netted across the pair: 10.00 one way and 5.00 the other stay
        // two facts, because turning them into one needs a rate nobody quoted.
        expect(carried.map((expense) => expense.costMinor).sort()).toEqual(['1000', '500'])
    })
})
