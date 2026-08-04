import { describe, expect, it } from 'vitest'
import type { ImportIntoRoomInput, ImportedExpenseInput } from '@/lib/api-types'
import { importSourceFingerprint } from '@/server/splitwiseImport'

const dinner = (): ImportedExpenseInput => ({
    date: '2026-01-02',
    description: 'Dinner',
    currencyCode: 'EUR',
    costMinor: '6000',
    paidBy: 'Ana',
    splitMode: 'EQUAL',
    shares: [
        { member: 'Ana', amountMinor: '2000' },
        { member: 'Bruno', amountMinor: '4000' },
    ],
})

const taxi = (): ImportedExpenseInput => ({
    date: '2026-01-03',
    description: 'Taxi',
    category: undefined,
    currencyCode: 'EUR',
    costMinor: '1000',
    paidBy: 'Bruno',
    shares: [
        { member: 'Ana', amountMinor: '1000' },
        { member: 'Bruno', amountMinor: '0' },
    ],
})

const source = (): ImportIntoRoomInput => ({
    members: [
        { sourceName: 'Ana', memberId: 'member-ana' },
        { sourceName: 'Bruno', newMemberName: 'Bruno' },
    ],
    expenses: [dinner(), taxi()],
})

describe('existing-room import source fingerprint', () => {
    it('ignores room mappings and source array order while preserving source semantics', () => {
        const original = source()
        const reordered: ImportIntoRoomInput = {
            // Mapping choices are target-room state, not source identity. Case is
            // immaterial because source names are the import's case-insensitive join key.
            members: [
                { sourceName: 'BRUNO', memberId: 'entirely-different-target' },
                { sourceName: 'ANA', newMemberName: 'A different proposed room name' },
            ],
            expenses: [
                {
                    ...taxi(),
                    costMinor: '01000',
                    paidBy: 'BRUNO',
                    splitMode: 'EXACT',
                    category: null,
                    shares: [...taxi().shares]
                        .reverse()
                        .map((share) => ({ ...share, member: share.member.toUpperCase() })),
                },
                {
                    ...dinner(),
                    paidBy: 'ANA',
                    shares: [...dinner().shares]
                        .reverse()
                        .map((share) => ({ ...share, member: share.member.toUpperCase() })),
                },
            ],
        }

        expect(importSourceFingerprint(reordered)).toBe(importSourceFingerprint(original))
        expect(importSourceFingerprint(original)).toMatch(/^[a-f0-9]{64}$/)
    })

    it('treats expenses as a multiset, so duplicate multiplicity remains significant', () => {
        const one = source()
        const duplicate = source()
        duplicate.expenses.push(dinner())

        expect(importSourceFingerprint(duplicate)).not.toBe(importSourceFingerprint(one))

        const sameDuplicateReordered = source()
        sameDuplicateReordered.expenses = [dinner(), taxi(), dinner()]
        expect(importSourceFingerprint(sameDuplicateReordered)).toBe(importSourceFingerprint(duplicate))
    })

    it.each([
        ['roster', (body: ImportIntoRoomInput) => body.members.push({ sourceName: 'Carla', newMemberName: 'Carla' })],
        ['date', (body: ImportIntoRoomInput) => (body.expenses[0].date = '2026-01-04')],
        ['description', (body: ImportIntoRoomInput) => (body.expenses[0].description = 'Late dinner')],
        ['category', (body: ImportIntoRoomInput) => (body.expenses[0].category = 'Dining out')],
        ['currency', (body: ImportIntoRoomInput) => (body.expenses[0].currencyCode = 'USD')],
        ['cost', (body: ImportIntoRoomInput) => (body.expenses[0].costMinor = '6001')],
        ['payer', (body: ImportIntoRoomInput) => (body.expenses[0].paidBy = 'Bruno')],
        ['split mode', (body: ImportIntoRoomInput) => (body.expenses[0].splitMode = 'EXACT')],
        ['share amount', (body: ImportIntoRoomInput) => (body.expenses[0].shares[0].amountMinor = '2001')],
    ])('changes when the source %s changes', (_field, change) => {
        const original = source()
        const changed = source()
        change(changed)

        expect(importSourceFingerprint(changed)).not.toBe(importSourceFingerprint(original))
    })
})
