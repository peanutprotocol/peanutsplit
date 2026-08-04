import { describe, expect, it } from 'vitest'
import type { ApiMember } from '@/lib/api-types'
import {
    existingRoomMappingProblem,
    formatImportedAt,
    importMemberMappings,
    initialExistingRoomMemberDrafts,
    unsupportedImportCurrencies,
    type ExistingRoomMemberDraft,
} from './existing-room-mapping'

const member = (id: string, name: string): ApiMember => ({
    id,
    name,
    avatar: null,
    createdAt: '2026-08-04T00:00:00.000Z',
})

describe('existing-room import member mapping', () => {
    it('checks source-to-room priceability while preserving unrated identity pairs', () => {
        const expense = (currencyCode: string) => ({ currencyCode })

        expect(unsupportedImportCurrencies([expense('EUR')], 'KPW')).toEqual(['EUR'])
        expect(unsupportedImportCurrencies([expense('KPW')], 'KPW')).toEqual([])
        expect(unsupportedImportCurrencies([expense('EUR'), expense('EUR'), expense('USD')], 'KPW')).toEqual([
            'EUR',
            'USD',
        ])
        expect(unsupportedImportCurrencies([expense('EUR')], 'USD')).toEqual([])
    })

    it('suggests only unambiguous exact names and proposes every other source person as new', () => {
        const drafts = initialExistingRoomMemberDrafts(
            [' ana ', 'Bruno', 'Alex'],
            [member('ana', 'Ana'), member('alex-1', 'Alex'), member('alex-2', 'alex')]
        )

        expect(drafts).toEqual([
            { sourceName: ' ana ', memberId: 'ana', newMemberName: 'ana' },
            { sourceName: 'Bruno', memberId: null, newMemberName: 'Bruno' },
            { sourceName: 'Alex', memberId: null, newMemberName: 'Alex' },
        ])
    })

    it('does not map two source people to the same room member', () => {
        const members = [member('ana', 'Ana')]
        const drafts: ExistingRoomMemberDraft[] = [
            { sourceName: 'Ana', memberId: 'ana', newMemberName: 'Ana' },
            { sourceName: 'Ana (2)', memberId: 'ana', newMemberName: 'Ana (2)' },
        ]

        expect(existingRoomMappingProblem(drafts, members)).toBe('duplicate-existing-member')
    })

    it('catches stale selections and every invalid proposed addition', () => {
        const members = [member('ana', 'Ana')]
        const problemFor = (...drafts: ExistingRoomMemberDraft[]) => existingRoomMappingProblem(drafts, members)

        expect(problemFor({ sourceName: 'Bea', memberId: 'removed', newMemberName: 'Bea' })).toBe(
            'missing-existing-member'
        )
        expect(problemFor({ sourceName: 'Bea', memberId: null, newMemberName: '  ' })).toBe('empty-new-name')
        expect(problemFor({ sourceName: 'Bea', memberId: null, newMemberName: ' ANA ' })).toBe(
            'new-name-already-exists'
        )
        expect(
            problemFor(
                { sourceName: 'Bea', memberId: null, newMemberName: 'New' },
                { sourceName: 'Cleo', memberId: null, newMemberName: ' new ' }
            )
        ).toBe('duplicate-new-name')
    })

    it('does not treat the per-file parser cap as a total room-roster cap', () => {
        const members = Array.from({ length: 25 }, (_, index) => member(`member-${index}`, `Person ${index}`))
        const drafts = [{ sourceName: 'Fresh person', memberId: null, newMemberName: 'Fresh person' }]

        expect(existingRoomMappingProblem(drafts, members)).toBeNull()
    })

    it('builds the discriminated atomic-import wire mapping and trims only proposed names', () => {
        expect(
            importMemberMappings([
                { sourceName: ' Ana ', memberId: 'ana', newMemberName: 'ignored' },
                { sourceName: 'Bruno', memberId: null, newMemberName: ' Bruno B. ' },
            ])
        ).toEqual([
            { sourceName: ' Ana ', memberId: 'ana' },
            { sourceName: 'Bruno', newMemberName: 'Bruno B.' },
        ])
    })

    it('renders a durable import instant down to seconds and preserves an invalid server value', () => {
        expect(formatImportedAt('2026-08-04T03:04:05.000Z', 'en-US')).toMatch(/03:04:05/)
        expect(formatImportedAt('not-a-date', 'en-US')).toBe('not-a-date')
    })
})
