import { describe, expect, it } from 'vitest'
import { MAX_SENTENCE_NAME_CHARS, pairCard } from './BalanceStrip'

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
     * The relationship words are the message; the name is a label the reader can see in full on
     * the avatar, in the people list and on the derivation sheet. So the name gives way first.
     *
     * The sentence gets two lines. At 375px a 46-character name needed three, and because
     * "{name} owes you" puts the verb last, the third line that got clamped away was "owes you"
     * — leaving a cut name over an amount with only the tint saying which way the money ran.
     * Wrapping alone could not fix that; the cap is what makes it hold at any length, and the
     * name field takes 80 characters.
     */
    const longName = 'Maximiliana Wolfeschlegelsteinhausenbergerdorff'
    const cut = 'Maximiliana Wolfesc…'
    const long = { id: 'long', name: longName }

    it('cuts a name too long for the two lines, and keeps the relationship words', () => {
        const card = pairCard([ana, long], { ana: '3000', long: '-3000' }, 'ana', true, t)

        expect(card.label).toBe(`pair.owesYou {"name":"${cut}"}`)
        expect([...cut]).toHaveLength(MAX_SENTENCE_NAME_CHARS)
    })

    it('cuts the name in the other direction too', () => {
        const card = pairCard([ana, long], { ana: '-3000', long: '3000' }, 'ana', true, t)

        expect(card.label).toBe(`pair.youOwe {"name":"${cut}"}`)
    })

    it('cuts the name in the zero state, where the sentence is longest', () => {
        const card = pairCard([ana, long], { ana: '0', long: '0' }, 'ana', false, t)

        expect(card.label).toBe(`${cut} · nothingYet`)
    })

    it('cuts both names when nobody on this device is in the room', () => {
        const other = { id: 'other', name: 'Bartholomew Fitzgerald-Montgomery' }
        const card = pairCard([long, other], { long: '-3000', other: '3000' }, undefined, true, t)

        expect(card.label).toBe(`pair.owes {"debtor":"${cut}","creditor":"Bartholomew Fitzger…"}`)
    })

    it('leaves a name that already fits alone', () => {
        const fits = { id: 'fits', name: 'A'.repeat(MAX_SENTENCE_NAME_CHARS) }
        const card = pairCard([ana, fits], { ana: '3000', fits: '-3000' }, 'ana', true, t)

        expect(card.label).toBe(`pair.owesYou {"name":"${fits.name}"}`)
    })

    it('cuts on characters, so an emoji in a name never becomes half a character', () => {
        const party = { id: 'party', name: '🎉'.repeat(30) }
        const card = pairCard([ana, party], { ana: '3000', party: '-3000' }, 'ana', true, t)

        expect(card.label).toBe(`pair.owesYou {"name":"${'🎉'.repeat(MAX_SENTENCE_NAME_CHARS - 1)}…"}`)
    })

    /**
     * Only the sentence is cut. `data-member` comes off `about.name`, and every e2e spec that
     * reads a balance selects on it — `[data-testid="balance-card"][data-member="Ana"]` in
     * balances, realtime, room and import. So does the avatar and the accessible name.
     */
    it('keeps the full name on the subject the card publishes and the tap opens', () => {
        const card = pairCard([ana, long], { ana: '3000', long: '-3000' }, 'ana', true, t)

        expect(card.about).toBe(long)
        expect(card.about.name).toBe(longName)
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
