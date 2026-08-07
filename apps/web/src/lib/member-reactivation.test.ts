import { describe, expect, it } from 'vitest'
import { reactivationCandidateForName } from './member-reactivation'

const active = { id: 'a', name: 'Ana María', avatar: null, createdAt: '2026-01-01T00:00:00.000Z' }
const former = { ...active, id: 'f', removedAt: '2026-08-06T00:00:00.000Z' }

describe('same-name reactivation recovery', () => {
    it('uses only Former rows before submit but accepts a stale matching row after the server response', () => {
        expect(reactivationCandidateForName([active], '  ana   maría ')).toBeNull()
        expect(reactivationCandidateForName([former], '  ana   maría ')?.id).toBe('f')
        expect(reactivationCandidateForName([active], 'Ana María', false)?.id).toBe('a')
    })
})
