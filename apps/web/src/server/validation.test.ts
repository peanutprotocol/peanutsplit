import { describe, expect, it } from 'vitest'
import {
    expenseSchema,
    importRoomSchema,
    modelAmountMinor,
    receiptItemSchema,
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
