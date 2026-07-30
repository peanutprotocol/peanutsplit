/**
 * The recap page draws cards from two surfaces, and nothing in either component can see the other.
 * This pins the rule that keeps them from drawing the same card twice.
 */
import { describe, expect, it } from 'vitest'
import { CARD_KINDS, WRAPPED_DECK, shelfKinds, type CardKind } from './achievements-contract'

/** Every kind the shelf can produce — `unlocksFor` minus `wrapped`, which the deck owns. */
const SHELF_KINDS = ['crew', 'passport', 'alterego'] as const satisfies readonly CardKind[]

describe('the settled recap draws each card once', () => {
    it('the shelf stands down on everything the deck already draws', () => {
        const deck = WRAPPED_DECK.filter((card) => card !== 'recap')
        const shelf = shelfKinds(SHELF_KINDS, true)
        expect(shelf).toEqual(['crew'])
        expect(deck.filter((card) => (shelf as readonly string[]).includes(card))).toEqual([])
    })

    it('an unsettled recap has no deck, so the shelf keeps all of it', () => {
        expect(shelfKinds(SHELF_KINDS, false)).toEqual([...SHELF_KINDS])
    })

    it('the overlap is real — this test would pass vacuously if the two sets never met', () => {
        // Without this, narrowing WRAPPED_DECK to nothing would make the assertion above trivial.
        const overlap = SHELF_KINDS.filter((kind) => (WRAPPED_DECK as readonly string[]).includes(kind))
        expect(overlap).toEqual(['passport', 'alterego'])
    })

    it('every shelf kind is a real card kind, so the filter cannot drift off the contract', () => {
        for (const kind of SHELF_KINDS) expect(CARD_KINDS).toContain(kind)
    })
})
