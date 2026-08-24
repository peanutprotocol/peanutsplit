import { describe, expect, it } from 'vitest'
import { prefillHref, readPrefill } from './room-prefill'

/**
 * The link is untrusted input that decides what a room is called and what it counts in, so the
 * cases that matter are the ones it must refuse: a currency with no rate, a drawing that is not
 * one, and the creator's name, which no link may ever set.
 */
describe('readPrefill', () => {
    it('reads a template link', () => {
        expect(readPrefill({ name: 'Bali villa', currency: 'idr', emblem: 'island', template: 'bali-villa' })).toEqual({
            name: 'Bali villa',
            currency: 'IDR',
            emblem: 'island',
            template: 'bali-villa',
        })
    })

    it.each([
        ['an invented ticker', { currency: 'XYZ' }],
        ['a drawing that does not exist', { emblem: 'unicorn' }],
        ['a name of nothing but spaces', { name: '   ' }],
        ['a name past the room limit', { name: 'x'.repeat(81) }],
        ['a template slug of the wrong shape', { template: 'Bali Villa' }],
        ['the creator name', { creatorName: 'Edie' }],
    ])('drops %s', (_case, query) => {
        expect(readPrefill(query)).toEqual({})
    })

    it('collapses the whitespace a pasted name arrives with', () => {
        expect(readPrefill({ name: '  Ski   week ' })).toEqual({ name: 'Ski week' })
    })
})

describe('prefillHref', () => {
    it('carries the prefill and the campaign, and nothing that was empty', () => {
        expect(
            prefillHref('/new', { name: 'Ski week', emblem: 'ski', template: 'ski-week' }, { utm_source: 'reddit' })
        ).toBe('/new?name=Ski+week&emblem=ski&template=ski-week&utm_source=reddit')
    })
})
