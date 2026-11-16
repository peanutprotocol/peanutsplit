/**
 * The recap page draws cards from two surfaces, and nothing in either component can see the other.
 * This pins the rule that keeps them from drawing the same card twice.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    AWARD_IDS,
    CARD_KINDS,
    WRAPPED_DECK,
    achievementCardPath,
    shelfKinds,
    type CardKind,
} from './achievements-contract'

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

describe('card paths per build', () => {
    const SLUG = 'ski-trip-kunc-syrup-drum'
    const alterEgo = { award: AWARD_IDS[0], persona: 'peanut', palette: 'sunset' }
    const alterEgoQuery = `a=${AWARD_IDS[0]}&p=peanut&c=sunset`

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    it('keeps the web paths relative and unchanged', () => {
        expect(achievementCardPath(SLUG, 'crew')).toBe(`/r/${SLUG}/card/crew`)
        expect(achievementCardPath(SLUG, 'alterego')).toBe(`/r/${SLUG}/card/alterego`)
        expect(achievementCardPath(SLUG, 'alterego', alterEgo)).toBe(`/r/${SLUG}/card/alterego?${alterEgoQuery}`)
    })

    it('puts the same paths on the site origin in the app', async () => {
        vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
        vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://peanutsplit.com')
        vi.resetModules()
        const native = await import('./achievements-contract')

        expect(native.achievementCardPath(SLUG, 'crew')).toBe(`https://peanutsplit.com/r/${SLUG}/card/crew`)
        expect(native.achievementCardPath(SLUG, 'alterego', alterEgo)).toBe(
            `https://peanutsplit.com/r/${SLUG}/card/alterego?${alterEgoQuery}`
        )
    })
})
