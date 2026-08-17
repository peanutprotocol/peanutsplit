import { describe, expect, it } from 'vitest'
import { currencyOf, splitScriptMessage } from './script-message'

describe('currencyOf', () => {
    it('reads the currency off a symbol', () => {
        expect(currencyOf('€12')).toBe('EUR')
        expect(currencyOf('$8')).toBe('USD')
        expect(currencyOf('£15,50')).toBe('GBP')
    })

    it('reads the currency off a trailing code', () => {
        expect(currencyOf('12.50 EUR')).toBe('EUR')
    })

    it('returns null once editing has removed every symbol/code trace', () => {
        expect(currencyOf('12')).toBeNull()
    })
})

describe('splitScriptMessage', () => {
    it('pulls the first currency-shaped token out as amount, the rest verbatim', () => {
        expect(splitScriptMessage('Hey, you owe me €12 for pizza')).toEqual({
            rest: 'Hey, you owe me  for pizza',
            amount: '€12',
        })
    })

    it('returns the whole text as rest, with an empty amount, when nothing matches', () => {
        expect(splitScriptMessage('Hey, settle up whenever')).toEqual({
            rest: 'Hey, settle up whenever',
            amount: '',
        })
    })
})
