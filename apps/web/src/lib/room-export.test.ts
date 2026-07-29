import { describe, expect, it } from 'vitest'
import type { RoomState } from './api-types'
import { exportFilename, portableRoom, roomCsv, roomJson } from './room-export'

const state: RoomState = {
    room: {
        id: 'internal-room-id',
        slug: 'lisbon-weekend-secret',
        name: 'Lisbon, "weekend"',
        emoji: 'trip-plane',
        currency: 'EUR',
        coverUrl: null,
        theme: 'mint',
        createdAt: '2026-07-01T10:00:00.000Z',
        archivedAt: null,
    },
    members: [
        { id: 'ana', name: 'Ana', avatar: null, createdAt: '2026-07-01T10:00:00.000Z' },
        { id: 'bea', name: 'Bea', avatar: 'firefly', createdAt: '2026-07-01T10:01:00.000Z' },
    ],
    expenses: [
        {
            id: 'expense-1',
            description: 'Train, airport',
            amountMinor: '12345',
            currency: 'GBP',
            baseAmountMinor: '14567',
            fxRate: '1.179991000000',
            splitMode: 'EXACT',
            paidById: 'ana',
            createdById: 'bea',
            date: '2026-07-02T00:00:00.000Z',
            category: 'transport',
            createdAt: '2026-07-02T09:00:00.000Z',
            shares: [
                { memberId: 'ana', amountMinor: '7000', enteredAmountMinor: '5932' },
                { memberId: 'bea', amountMinor: '7567', enteredAmountMinor: '6413' },
            ],
            reactions: [{ emoji: 'spark', memberId: 'bea' }],
        },
    ],
    settlements: [
        {
            id: 'settlement-1',
            fromId: 'bea',
            toId: 'ana',
            createdById: null,
            amountMinor: '5000',
            method: 'peanut',
            note: 'Receipt: https://example.com/receipt, documented only',
            createdAt: '2026-07-03T10:00:00.000Z',
        },
    ],
    balances: { ana: '2283', bea: '-2283' },
    suggestedTransfers: [{ fromId: 'bea', toId: 'ana', amountMinor: '2283' }],
}

describe('room export', () => {
    it('keeps ledger and original-currency provenance without exporting the bearer credential', () => {
        const exported = portableRoom(state, '2026-07-29T12:00:00.000Z')

        expect(exported.expenses[0]).toMatchObject({
            amountMinor: '12345',
            currency: 'GBP',
            baseAmountMinor: '14567',
            fxRate: '1.179991000000',
            shares: [
                { memberId: 'ana', amountMinor: '7000', enteredAmountMinor: '5932' },
                { memberId: 'bea', amountMinor: '7567', enteredAmountMinor: '6413' },
            ],
        })
        expect(exported.settlements).toEqual(state.settlements)
        expect(exported.balances).toEqual(state.balances)
        expect(JSON.stringify(exported)).not.toContain(state.room.slug)
        expect(exported.room).not.toHaveProperty('slug')
        expect(exported.room).not.toHaveProperty('id')
    })

    it('produces a parseable JSON snapshot with a stable schema marker', () => {
        const parsed = JSON.parse(roomJson(state, '2026-07-29T12:00:00.000Z'))

        expect(parsed.schema).toBe('peanut-split-room')
        expect(parsed.version).toBe(1)
        expect(parsed.expenses[0].shares).toHaveLength(2)
        expect(parsed.suggestedTransfers).toEqual(state.suggestedTransfers)
    })

    it('normalizes CSV rows without losing exact shares, FX, settlements or punctuation', () => {
        const csv = roomCsv(state)

        expect(csv).toContain('"Lisbon, ""weekend"""')
        expect(csv).toContain('"Train, airport"')
        expect(csv).toContain('expense,expense-1')
        expect(csv).toContain('share,,expense-1,ana,,7000,EUR,,5932,1.179991000000,EXACT')
        expect(csv).toContain('settlement,settlement-1,,,,5000,EUR')
        expect(csv).toContain('balance,,,ana,,2283,EUR')
        expect(csv).toContain('balance,,,bea,,-2283,EUR')
        expect(csv).toContain('suggested_transfer,,,,,2283,EUR')
        expect(csv).toContain('bea,ana')
        expect(csv).toContain('"Receipt: https://example.com/receipt, documented only"')
        expect(csv).not.toContain(state.room.slug)
    })

    it('uses a safe local filename and never derives it from the slug', () => {
        expect(exportFilename(state.room.name, 'json')).toBe('lisbon-weekend.json')
        expect(exportFilename('✨', 'csv')).toBe('split-room.csv')
    })

    it('does not turn user-authored spreadsheet cells into executable formulas', () => {
        const hostile: RoomState = {
            ...state,
            expenses: [{ ...state.expenses[0], description: '=HYPERLINK("https://example.com")' }],
            settlements: [{ ...state.settlements[0], method: '\t@SUM(1+1)' }],
        }
        const csv = roomCsv(hostile)

        expect(csv).toContain(`"'=HYPERLINK(""https://example.com"")"`)
        expect(csv).toContain(`'\t@SUM(1+1)`)
        // Numeric balances stay numeric so the spreadsheet remains useful.
        expect(csv).toContain('balance,,,bea,,-2283,EUR')
    })
})
