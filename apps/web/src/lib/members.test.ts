import { describe, expect, it } from 'vitest'
import { activeMember, activeMembers, activityRoleMembers, balanceMembers, formerMembers } from './members'

const members = [
    { id: 'ana', removedAt: null },
    { id: 'bea' }, // older cached wire payload
    { id: 'caro', removedAt: '2026-08-06T00:00:00.000Z' },
]

describe('active roster versus ledger directory', () => {
    it('treats a missing removedAt as active for rolling-cache compatibility', () => {
        expect(activeMembers(members).map((member) => member.id)).toEqual(['ana', 'bea'])
        expect(formerMembers(members).map((member) => member.id)).toEqual(['caro'])
        expect(activeMember(members, 'caro')).toBeUndefined()
    })

    it('hides square Former identities but surfaces one whose balance reopened', () => {
        expect(balanceMembers(members, { ana: '0', bea: '0', caro: '0' }).map((member) => member.id)).toEqual([
            'ana',
            'bea',
        ])
        expect(balanceMembers(members, { ana: '25', bea: '0', caro: '-25' }).map((member) => member.id)).toEqual([
            'ana',
            'bea',
            'caro',
        ])
    })

    it('keeps a newly Former draft role visible only until it is changed or removed', () => {
        expect(activityRoleMembers(members, new Set(['caro'])).map((member) => member.id)).toEqual([
            'ana',
            'bea',
            'caro',
        ])
        expect(activityRoleMembers(members, new Set()).map((member) => member.id)).toEqual(['ana', 'bea'])
    })
})
