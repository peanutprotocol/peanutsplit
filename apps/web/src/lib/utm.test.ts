import { describe, expect, it } from 'vitest'
import { readUtm, utmLabel, withParams } from './utm'

describe('utmLabel', () => {
    it.each([
        ['reddit', 'reddit'],
        ['  Reddit  ', 'reddit'],
        ['r_digitalnomad', 'r_digitalnomad'],
        ['template-villa-week', 'template-villa-week'],
        ['", onmouseover="x', null],
        ['a b', null],
        ['-leading', null],
        ['x'.repeat(49), null],
        ['', null],
        [undefined, null],
    ])('reads %s as %s', (raw, expected) => {
        expect(utmLabel(raw)).toBe(expected)
    })
})

describe('readUtm', () => {
    it('keeps the campaign keys and drops everything else', () => {
        expect(readUtm({ utm_source: 'reddit', utm_medium: 'community', name: 'Villa week', utm_term: 'a b' })).toEqual(
            { utm_source: 'reddit', utm_medium: 'community' }
        )
    })

    it('takes the first value of a repeated parameter', () => {
        expect(readUtm({ utm_source: ['reddit', 'x'] })).toEqual({ utm_source: 'reddit' })
    })
})

describe('withParams', () => {
    it('drops empty values and encodes the rest', () => {
        expect(withParams('/new', { name: 'Villa week', currency: undefined })).toBe('/new?name=Villa+week')
    })

    it('keeps a query the path already carries', () => {
        expect(withParams('/new?a=1', { b: '2' })).toBe('/new?a=1&b=2')
    })

    it('leaves a path with nothing to add alone', () => {
        expect(withParams('/new', {})).toBe('/new')
    })
})
