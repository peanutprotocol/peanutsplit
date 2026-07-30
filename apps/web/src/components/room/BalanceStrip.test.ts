import { describe, expect, it } from 'vitest'
import { pairCard } from './BalanceStrip'

/**
 * The pair card makes a claim about somebody's money in words. A wrong key here says "You owe
 * Bea" over a number Bea owes you, which no type checks and no e2e assertion on `data-net`
 * would catch — both cards carry the same magnitude. So the decision is a pure function and
 * the keys it picks are asserted directly.
 */
const t = (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key)

const ana = { id: 'ana', name: 'Ana' }
const bea = { id: 'bea', name: 'Bea' }
const pair = [ana, bea]

describe('pairCard', () => {
    it('says the other person owes you when your own balance is up', () => {
        const card = pairCard(pair, { ana: '1100', bea: '-1100' }, 'ana', true, t)

        expect(card.label).toBe('pair.owesYou {"name":"Bea"}')
        expect(card.card).toBe('bg-green-1')
        expect(card.labelClass).toBe('text-n-1')
        // The sentence is about Bea, so the card publishes Bea's net — the negation of the
        // viewer's own. This is the rule an e2e reader trips on.
        expect(card.about).toBe(bea)
        expect(card.net).toBe('-1100')
    })

    it('says you owe the other person when your own balance is down', () => {
        const card = pairCard(pair, { ana: '-1100', bea: '1100' }, 'ana', true, t)

        expect(card.label).toBe('pair.youOwe {"name":"Bea"}')
        expect(card.card).toBe('bg-error-1')
        expect(card.labelClass).toBe('text-n-1')
        expect(card.about).toBe(bea)
        expect(card.net).toBe('1100')
    })

    it('reads from whichever device is looking', () => {
        const card = pairCard(pair, { ana: '1100', bea: '-1100' }, 'bea', true, t)

        expect(card.label).toBe('pair.youOwe {"name":"Ana"}')
        expect(card.card).toBe('bg-error-1')
        expect(card.about).toBe(ana)
        expect(card.net).toBe('1100')
    })

    it('calls a zero with expenses behind it settled up, in the room tint', () => {
        const card = pairCard(pair, { ana: '0', bea: '0' }, 'ana', true, t)

        expect(card.label).toBe('Bea · settled')
        expect(card.card).toBe('bg-[var(--split-theme-tint,#FFFFFF)]')
        expect(card.labelClass).toBe('text-n-3')
        expect(card.net).toBe('0')
    })

    it('refuses to congratulate a room that has never held an expense', () => {
        const card = pairCard(pair, { ana: '0', bea: '0' }, 'ana', false, t)

        expect(card.label).toBe('Bea · nothingYet')
        expect(card.card).toBe('bg-[var(--split-theme-tint,#FFFFFF)]')
        expect(card.labelClass).toBe('text-n-3')
    })

    /**
     * The state every brand-new two-person room opens in, and the one that used to be
     * anonymous: an avatar, "nothing yet" and a zero, with no name anywhere on the card. The
     * tap has to land on the same person the card is about, zero or not.
     */
    it('names its subject in the zero state, and that subject is what the tap opens', () => {
        const settled = pairCard(pair, { ana: '0', bea: '0' }, 'ana', true, t)
        const fresh = pairCard(pair, { ana: '0', bea: '0' }, 'ana', false, t)

        expect(settled.label).toContain('Bea')
        expect(fresh.label).toContain('Bea')
        // `about` is the whole card — avatar, name, net and the derivation the tap opens — so
        // the zero branch has to reach the counterparty exactly like the others do.
        expect(settled.about).toBe(bea)
        expect(fresh.about).toBe(bea)
    })

    it('names both people when nobody on this device is in the room', () => {
        const card = pairCard(pair, { ana: '1100', bea: '-1100' }, undefined, true, t)

        expect(card.label).toBe('pair.owes {"debtor":"Bea","creditor":"Ana"}')
        expect(card.card).toBe('bg-error-1')
        // The debtor is the subject, so the net on the card is the negative one, and the tap
        // opens the working of the person with something to answer for.
        expect(card.about).toBe(bea)
        expect(card.net).toBe('-1100')
    })

    it('treats a member id the roster does not hold as no viewer at all', () => {
        const card = pairCard(pair, { ana: '1100', bea: '-1100' }, 'someone-who-left', true, t)

        expect(card.label).toBe('pair.owes {"debtor":"Bea","creditor":"Ana"}')
    })

    it('picks the same subject on every poll when both balances are zero', () => {
        const first = pairCard(pair, { ana: '0', bea: '0' }, undefined, true, t)
        const second = pairCard([bea, ana], { ana: '0', bea: '0' }, undefined, true, t)

        expect(first.about).toBe(ana)
        expect(second.about).toBe(ana)
    })

    it('reads a balance the server never sent as zero rather than crashing', () => {
        const card = pairCard(pair, {}, 'ana', false, t)

        expect(card.label).toBe('Bea · nothingYet')
        expect(card.net).toBe('0')
    })

    /**
     * Only a two-person room has one independent number to state, so only a two-person room
     * gets this card. A shorter roster used to reach the first property read and die there.
     */
    it('refuses a roster that is not a pair', () => {
        expect(() => pairCard([ana], { ana: '0' }, 'ana', false, t)).toThrow(/exactly two members/)
        expect(() => pairCard([], {}, undefined, false, t)).toThrow(/exactly two members/)
    })
})
