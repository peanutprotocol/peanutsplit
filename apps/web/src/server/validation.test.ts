import { describe, expect, it } from 'vitest'
import {
    createRoomSchema,
    expensePatchSchema,
    expenseSchema,
    expenseUpdateSchema,
    importRoomSchema,
    modelAmountMinor,
    rateQuerySchema,
    receiptItemSchema,
    roomSettingsSchema,
    settlementSchema,
} from '@/server/validation'

const expense = (amountMinor: unknown) => ({
    description: 'Dinner',
    amountMinor,
    currency: 'EUR',
    paidById: 'member-a',
    splitMode: 'EQUAL',
})

const settlement = (amountMinor: unknown) => ({
    fromId: 'member-a',
    toId: 'member-b',
    amountMinor,
})

const imported = (costMinor: unknown, shareMinor: unknown = costMinor) => ({
    roomName: 'Trip',
    currency: 'EUR',
    creatorName: 'Ana',
    members: ['Ana'],
    expenses: [
        {
            date: '2026-07-28',
            description: 'Dinner',
            currencyCode: 'EUR',
            costMinor,
            paidBy: 'Ana',
            shares: [{ member: 'Ana', amountMinor: shareMinor }],
        },
    ],
})

describe('the expense name is optional', () => {
    it('takes an absent, blank or whitespace name and stores the empty string', () => {
        for (const description of [undefined, '', '   ']) {
            const parsed = expenseSchema.safeParse({ ...expense('1200'), description })
            expect(parsed.success).toBe(true)
            expect(parsed.success && parsed.data.description).toBe('')
        }
    })

    it('still bounds a name that is there', () => {
        expect(expenseSchema.safeParse({ ...expense('1200'), description: 'x'.repeat(256) }).success).toBe(false)
    })

    it('leaves an edit that never mentions the name undefined, so the PATCH can skip the column', () => {
        const body = { ...expense('1200') }
        delete (body as { description?: string }).description
        const parsed = expenseUpdateSchema.safeParse(body)
        expect(parsed.success).toBe(true)
        expect(parsed.success && 'description' in parsed.data).toBe(false)
        // An explicit empty string is still a request to clear the name.
        const cleared = expenseUpdateSchema.safeParse({ ...expense('1200'), description: '  ' })
        expect(cleared.success && cleared.data.description).toBe('')
    })
})

/**
 * One rule, three entry points. The shape is the whole gate — a made-up ticker is a supported
 * room currency now, and what stops it from being netted against a real one is FX, not this.
 */
describe('currency codes', () => {
    const room = (currency: unknown) => createRoomSchema.safeParse({ name: 'Trip', currency, creatorName: 'Ana' })

    it('accepts a real code however it was typed', () => {
        expect(room('usd').success).toBe(true)
        expect(room('  eur  ').success).toBe(true)
        expect(room('ＵＳＤ').success).toBe(true)
        // The wide catalog, which is the point of the change.
        expect(room('INR').success).toBe(true)
        expect(room('KWD').success).toBe(true)
    })

    it('normalises to the one spelling a currency has', () => {
        const parsed = room('  usd ')
        expect(parsed.success && parsed.data.currency).toBe('USD')
    })

    it('accepts an invented three or four letter ticker', () => {
        expect(room('DOGE').success).toBe(true)
        expect(room('ZZZ').success).toBe(true)
        expect(room('beer').success).toBe(true)
    })

    it('rejects anything that is not three or four ASCII letters', () => {
        for (const code of ['US', 'EUROS', 'US1', 'U-S', 'US D', '', '   ', '$', 'x'.repeat(200)]) {
            expect(room(code).success).toBe(false)
        }
    })

    /** Cyrillic and Greek twins survive NFKC, so `[A-Z]` is what refuses them. Without this a
     *  room could hold two different strings that both read as "USD". */
    it('rejects homoglyphs', () => {
        expect(room('ЕUR').success).toBe(false) // Cyrillic Е
        expect(room('ΕUR').success).toBe(false) // Greek Ε
        expect(room('ЅЅЅ').success).toBe(false)
    })

    it('is the same rule on a room, an expense and a rate query', () => {
        expect(expenseSchema.safeParse({ ...expense('1200'), currency: 'DOGE' }).success).toBe(true)
        expect(expenseSchema.safeParse({ ...expense('1200'), currency: 'EUROS' }).success).toBe(false)
        expect(rateQuerySchema.safeParse({ from: 'doge', to: 'KWD' })).toMatchObject({
            success: true,
            data: { from: 'DOGE', to: 'KWD' },
        })
        expect(rateQuerySchema.safeParse({ from: 'EUR', to: 'US' }).success).toBe(false)
        expect(importRoomSchema.safeParse({ ...imported('100'), currency: 'DOGE' }).success).toBe(true)
    })
})

describe('public wire money', () => {
    it('accepts decimal strings through the signed BIGINT ceiling', () => {
        const max = '9223372036854775807'
        expect(expenseSchema.safeParse(expense(max)).success).toBe(true)
        expect(settlementSchema.safeParse(settlement(max)).success).toBe(true)
        expect(importRoomSchema.safeParse(imported(max)).success).toBe(true)
    })

    it('rejects JSON numbers instead of accepting already-rounded money', () => {
        expect(expenseSchema.safeParse(expense(1200)).success).toBe(false)
        expect(settlementSchema.safeParse(settlement(1200)).success).toBe(false)
        expect(importRoomSchema.safeParse(imported(1200, 1200)).success).toBe(false)
    })

    it('rejects negative, fractional and out-of-range strings before they reach Prisma', () => {
        for (const amount of ['-1', '12.00', '9223372036854775808', '9'.repeat(100)]) {
            expect(expenseSchema.safeParse(expense(amount)).success).toBe(false)
            expect(settlementSchema.safeParse(settlement(amount)).success).toBe(false)
            expect(importRoomSchema.safeParse(imported(amount)).success).toBe(false)
        }
    })
})

describe('weighted expense request shapes', () => {
    const weighted = (splitMode: 'PERCENTAGE' | 'SHARES', weight: unknown = '1') => ({
        ...expense('1200'),
        splitMode,
        weightedShares: [
            { memberId: 'member-a', weight },
            { memberId: 'member-b', weight: splitMode === 'PERCENTAGE' ? '9999' : '2' },
        ],
    })

    it('accepts percentage and share modes with positive decimal-string integer weights', () => {
        expect(expenseSchema.safeParse(weighted('PERCENTAGE')).success).toBe(true)
        expect(expenseSchema.safeParse(weighted('SHARES')).success).toBe(true)
        expect(expenseSchema.parse(weighted('SHARES')).weightedShares?.[0].weight).toBe('1')
    })

    it('rejects numeric, zero, negative, fractional and out-of-range weights', () => {
        for (const weight of [1, '0', '-1', '1.5', '9223372036854775808']) {
            expect(expenseSchema.safeParse(weighted('SHARES', weight)).success).toBe(false)
        }
    })

    it('exposes expectedSplitMode only on the update contract', () => {
        const update = expenseUpdateSchema.parse({ ...weighted('PERCENTAGE'), expectedSplitMode: 'PERCENTAGE' })
        expect(update.expectedSplitMode).toBe('PERCENTAGE')

        const create = expenseSchema.parse({ ...weighted('PERCENTAGE'), expectedSplitMode: 'PERCENTAGE' })
        expect('expectedSplitMode' in create).toBe(false)
    })

    it('rejects payload fields that belong to another split mode', () => {
        expect(expenseSchema.safeParse({ ...expense('100'), weightedShares: [] }).success).toBe(false)
        expect(expenseSchema.safeParse({ ...weighted('PERCENTAGE'), exactShares: [] }).success).toBe(false)
        expect(expenseSchema.safeParse({ ...weighted('SHARES'), participantIds: ['member-a'] }).success).toBe(false)
        expect(
            expenseSchema.safeParse({
                ...expense('100'),
                splitMode: 'EXACT',
                exactShares: [{ memberId: 'member-a', amountMinor: '100' }],
                weightedShares: [],
            }).success
        ).toBe(false)
    })

    it('keeps structured import modes limited to EQUAL and EXACT', () => {
        const input = imported('100')
        expect(
            importRoomSchema.safeParse({ ...input, expenses: [{ ...input.expenses[0], splitMode: 'EQUAL' }] }).success
        ).toBe(true)
        expect(
            importRoomSchema.safeParse({ ...input, expenses: [{ ...input.expenses[0], splitMode: 'PERCENTAGE' }] })
                .success
        ).toBe(false)
    })
})

describe('catch-up request shapes', () => {
    const command = {
        operation: 'CATCH_UP_EQUAL_PARTICIPANT' as const,
        action: 'add' as const,
        memberId: 'late-member',
        expectedDescription: 'Dinner',
        expectedAmountMinor: '1000',
        expectedBaseAmountMinor: '1000',
        expectedCurrency: 'EUR',
        expectedFxRate: '1',
        expectedPaidById: 'payer',
        expectedDate: '2026-08-03T12:00:00.000Z',
        expectedCategory: null,
    }

    it('accepts a reviewed room roster larger than the import-only limit', () => {
        expect(
            expensePatchSchema.safeParse({
                ...command,
                expectedParticipantIds: Array.from({ length: 24 }, (_, index) => `member-${index}`),
            }).success
        ).toBe(true)
    })

    it('still rejects duplicate reviewed participants', () => {
        expect(
            expensePatchSchema.safeParse({ ...command, expectedParticipantIds: ['member-a', 'member-a'] }).success
        ).toBe(false)
    })
})

describe('structured import dates', () => {
    it('accepts real leap days and rejects impossible calendar dates', () => {
        const withDate = (date: string) => {
            const body = imported('100')
            body.expenses[0].date = date
            return body
        }

        expect(importRoomSchema.safeParse(withDate('2024-02-29')).success).toBe(true)
        expect(importRoomSchema.safeParse(withDate('2026-02-31')).success).toBe(false)
        expect(importRoomSchema.safeParse(withDate('2025-02-29')).success).toBe(false)
    })
})

describe('money-write request keys', () => {
    it('accepts opaque browser keys and rejects short or punctuated values', () => {
        expect(expenseSchema.safeParse({ ...expense('100'), clientKey: 'expense-request-0001' }).success).toBe(true)
        expect(settlementSchema.safeParse({ ...settlement('100'), clientKey: 'settlement-request-0001' }).success).toBe(
            true
        )

        for (const clientKey of ['short', 'request key with spaces', 'request/key/with/slashes']) {
            expect(expenseSchema.safeParse({ ...expense('100'), clientKey }).success).toBe(false)
            expect(settlementSchema.safeParse({ ...settlement('100'), clientKey }).success).toBe(false)
        }
    })
})

describe('trust-ledger fields', () => {
    it('requires exactly one existing or staged payer', () => {
        expect(expenseSchema.safeParse({ ...expense('100'), paidById: undefined, newPaidByName: 'Bea' }).success).toBe(
            true
        )
        expect(expenseSchema.safeParse({ ...expense('100'), newPaidByName: 'Bea' }).success).toBe(false)
        expect(expenseSchema.safeParse({ ...expense('100'), paidById: undefined }).success).toBe(false)
    })

    it('accepts only http(s) receipt links', () => {
        expect(
            settlementSchema.safeParse({
                ...settlement('100'),
                receiptUrl: 'https://receipts.example/payment/abc',
            }).success
        ).toBe(true)
        expect(settlementSchema.safeParse({ ...settlement('100'), receiptUrl: 'javascript:alert(1)' }).success).toBe(
            false
        )
        expect(settlementSchema.safeParse({ ...settlement('100'), receiptUrl: 'file:///tmp/receipt' }).success).toBe(
            false
        )
        expect(() => settlementSchema.safeParse({ ...settlement('100'), receiptUrl: 'not a url' })).not.toThrow()
        expect(settlementSchema.safeParse({ ...settlement('100'), receiptUrl: 'not a url' }).success).toBe(false)
    })
})

describe('room settings', () => {
    it('takes a drawing on its own, and null to hand it back to the name', () => {
        expect(roomSettingsSchema.safeParse({ emoji: 'mountain' }).success).toBe(true)
        expect(roomSettingsSchema.safeParse({ emoji: null }).success).toBe(true)
        // A legacy room's emoji character is still a legal value to write.
        expect(roomSettingsSchema.safeParse({ emoji: '🎿' }).success).toBe(true)
        expect(roomSettingsSchema.safeParse({ name: 'Ski trip', emoji: 'ski' }).success).toBe(true)
    })

    /** The edit path must not be able to store an emblem a new room could not
     *  have been created with — one bound, checked from both ends. */
    it('bounds the drawing exactly as room creation does', () => {
        const room = { name: 'Trip', currency: 'EUR', creatorName: 'Ana' }
        const long = 'x'.repeat(25)

        expect(roomSettingsSchema.safeParse({ emoji: 'x'.repeat(24) }).success).toBe(true)
        expect(roomSettingsSchema.safeParse({ emoji: long }).success).toBe(false)
        expect(createRoomSchema.safeParse({ ...room, emoji: long }).success).toBe(false)
        expect(roomSettingsSchema.safeParse({ emoji: 12 }).success).toBe(false)
    })

    it('still refuses a body that changes nothing, and any key outside the three', () => {
        expect(roomSettingsSchema.safeParse({}).success).toBe(false)
        expect(roomSettingsSchema.safeParse({ emoji: 'ski', slug: 'other-room' }).success).toBe(false)
    })
})

describe('model money normalization', () => {
    it('keeps bounded safe numeric output working for receipt scan and quick add', () => {
        expect(receiptItemSchema.parse({ label: 'Coffee', amountMinor: 1250 }).amountMinor).toBe('1250')
        expect(modelAmountMinor.parse(1200)).toBe('1200')
        expect(modelAmountMinor.parse('007')).toBe('007')
    })

    it('rejects unsafe, fractional, negative and implausibly large model numbers', () => {
        for (const amount of [-1, 1.5, Number.MAX_SAFE_INTEGER, '9'.repeat(13)]) {
            expect(modelAmountMinor.safeParse(amount).success).toBe(false)
        }
    })
})
