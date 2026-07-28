import { describe, expect, it } from 'vitest'
import { MAX_ATTACH_CLAIMS, collectMemberships, planRecovery } from './account-recovery'
import type { AccountRoom } from './api-types'
import type { MemberIdentity } from './identity'
import type { RecentRoom } from './recent-rooms'

const identities = (map: Record<string, MemberIdentity>) => (slug: string) => map[slug] ?? null

const room = (overrides: Partial<AccountRoom> & Pick<AccountRoom, 'slug'>): AccountRoom => ({
    name: 'Ski trip',
    emoji: '⛷️',
    memberId: `m-${overrides.slug}`,
    memberName: 'Ana',
    memberToken: `tok-${overrides.slug}`,
    ...overrides,
})

const recent = (slug: string, lastSeenAt: number): RecentRoom => ({ slug, name: slug, lastSeenAt })

describe('collectMemberships', () => {
    it('sends only the memberships this device can prove', () => {
        const claims = collectMemberships(
            ['a', 'b', 'c'],
            identities({
                a: { memberId: 'm1', name: 'Ana', token: 'tok1' },
                // Claimed "that's me" on the join gate — no token, so the server
                // would answer token-mismatch. Not worth the round trip.
                b: { memberId: 'm2', name: 'Bea' },
                c: { memberId: 'm3', name: 'Cal', token: 'tok3' },
            })
        )
        expect(claims).toEqual([
            { slug: 'a', memberId: 'm1', token: 'tok1' },
            { slug: 'c', memberId: 'm3', token: 'tok3' },
        ])
    })

    it('skips rooms this device has no identity for', () => {
        expect(collectMemberships(['ghost'], identities({}))).toEqual([])
    })

    it('never sends the same room twice', () => {
        const claims = collectMemberships(['a', 'a'], identities({ a: { memberId: 'm1', name: 'Ana', token: 't' } }))
        expect(claims).toHaveLength(1)
    })

    it('caps the batch at what the endpoint accepts', () => {
        const slugs = Array.from({ length: MAX_ATTACH_CLAIMS + 10 }, (_, i) => `room-${i}`)
        const store = Object.fromEntries(slugs.map((slug) => [slug, { memberId: slug, name: 'Ana', token: slug }]))
        expect(collectMemberships(slugs, identities(store))).toHaveLength(MAX_ATTACH_CLAIMS)
    })
})

describe('planRecovery', () => {
    const now = 1_700_000_000_000

    it('remembers every room the account knows about', () => {
        const plan = planRecovery([room({ slug: 'ski' }), room({ slug: 'flat', emoji: null })], {
            recent: [],
            readIdentity: identities({}),
            now,
        })
        expect(plan.remember).toEqual([
            { slug: 'ski', name: 'Ski trip', emoji: '⛷️', lastSeenAt: now },
            { slug: 'flat', name: 'Ski trip', emoji: undefined, lastSeenAt: now - 1 },
        ])
    })

    it('keeps the real last-seen of a room this device was already using', () => {
        const yesterday = now - 24 * 60 * 60 * 1000
        const plan = planRecovery([room({ slug: 'ski' })], {
            recent: [recent('ski', yesterday)],
            readIdentity: identities({ ski: { memberId: 'm-ski', name: 'Ana', token: 'tok-ski' } }),
            now,
        })
        expect(plan.remember[0].lastSeenAt).toBe(yesterday)
    })

    it('writes the identity for a room the device has never seen — the new-phone case', () => {
        const plan = planRecovery([room({ slug: 'ski', memberName: 'Ana' })], {
            recent: [],
            readIdentity: identities({}),
            now,
        })
        expect(plan.identities).toEqual([
            { slug: 'ski', identity: { memberId: 'm-ski', name: 'Ana', token: 'tok-ski' } },
        ])
    })

    it('leaves an identity that already has its token alone', () => {
        const plan = planRecovery([room({ slug: 'ski' })], {
            recent: [],
            readIdentity: identities({ ski: { memberId: 'm-ski', name: 'Ana', token: 'tok-ski' } }),
            now,
        })
        expect(plan.identities).toEqual([])
    })

    it('upgrades a token-less identity for the same member, keeping the local name', () => {
        const plan = planRecovery([room({ slug: 'ski', memberName: 'Ana Ruiz' })], {
            recent: [],
            readIdentity: identities({ ski: { memberId: 'm-ski', name: 'Ana' } }),
            now,
        })
        expect(plan.identities).toEqual([
            { slug: 'ski', identity: { memberId: 'm-ski', name: 'Ana', token: 'tok-ski' } },
        ])
    })

    /** Someone tapped "I'm Bea" on this device on purpose. Recovery must not
     *  quietly turn them into Ana. */
    it('never overwrites an identity for a different member', () => {
        const plan = planRecovery([room({ slug: 'ski', memberId: 'm-ana' })], {
            recent: [],
            readIdentity: identities({ ski: { memberId: 'm-bea', name: 'Bea' } }),
            now,
        })
        expect(plan.identities).toEqual([])
        expect(plan.remember).toHaveLength(1)
    })

    it('handles two memberships in one room without duplicating it', () => {
        const plan = planRecovery([room({ slug: 'ski', memberId: 'm1' }), room({ slug: 'ski', memberId: 'm2' })], {
            recent: [],
            readIdentity: identities({}),
            now,
        })
        expect(plan.remember).toHaveLength(1)
        expect(plan.identities).toEqual([
            { slug: 'ski', identity: { memberId: 'm1', name: 'Ana', token: 'tok-ski' } },
        ])
    })

    it('is a no-op for an account with no rooms', () => {
        expect(planRecovery([], { recent: [], readIdentity: identities({}), now })).toEqual({
            remember: [],
            identities: [],
        })
    })
})
