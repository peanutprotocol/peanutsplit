import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expenseCurrencyShortlist, readExpenseCurrencies, rememberExpenseCurrency } from './expense-currencies'

describe('personal expense currencies', () => {
    let values: Map<string, string>
    beforeEach(() => {
        values = new Map()
        vi.stubGlobal('window', {
            localStorage: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value),
            },
        })
    })
    afterEach(() => vi.unstubAllGlobals())

    it.each([
        [[], 'JPY', ['JPY', 'USD', 'EUR']],
        [[], 'USD', ['USD', 'EUR', 'GBP']],
        [['EUR'], 'EUR', ['EUR', 'USD', 'GBP']],
        [['USD', 'EUR'], 'USD', ['USD', 'EUR', 'GBP']],
        [['THB', 'JPY'], 'EUR', ['THB', 'JPY', 'EUR']],
        [['THB', 'THB', 'JPY'], 'EUR', ['THB', 'JPY', 'EUR']],
        [['BEER', 'EUR'], 'JPY', ['BEER', 'EUR', 'JPY']],
    ])('shortlists %j with room %s as %j', (recents, room, expected) => {
        expect(expenseCurrencyShortlist(recents, room)).toEqual(expected)
    })

    it('remembers only the last two distinct successful saves, independently by room and person', () => {
        rememberExpenseCurrency('trip', 'ana', 'EUR')
        rememberExpenseCurrency('trip', 'ana', 'GBP')
        rememberExpenseCurrency('trip', 'ana', 'EUR')
        rememberExpenseCurrency('trip', 'bea', 'USD')
        rememberExpenseCurrency('home', 'ana', 'JPY')
        expect(readExpenseCurrencies('trip', 'ana')).toEqual(['EUR', 'GBP'])
        expect(readExpenseCurrencies('trip', 'bea')).toEqual(['USD'])
        expect(readExpenseCurrencies('home', 'ana')).toEqual(['JPY'])
        rememberExpenseCurrency('trip', 'ana', 'THB')
        expect(readExpenseCurrencies('trip', 'ana')).toEqual(['THB', 'EUR'])
    })

    it('does not share an anonymous preference when there is no claimed member', () => {
        rememberExpenseCurrency('trip', undefined, 'USD')
        expect(readExpenseCurrencies('trip')).toEqual([])
        expect(values.size).toBe(0)
    })

    it('tolerates corrupt, malformed and unavailable storage', () => {
        const key = 'ps:expense-currencies:trip:ana'
        for (const value of ['not json', '{}', 'null', '123']) {
            values.set(key, value)
            expect(readExpenseCurrencies('trip', 'ana')).toEqual([])
        }
        values.set(key, '[null,"EUR","EUR",42,"usd","BEER","GBP"]')
        expect(readExpenseCurrencies('trip', 'ana')).toEqual(['EUR', 'BEER'])
        vi.stubGlobal('window', {
            get localStorage() {
                throw new Error('blocked')
            },
        })
        expect(readExpenseCurrencies('trip', 'ana')).toEqual([])
        expect(() => rememberExpenseCurrency('trip', 'ana', 'USD')).not.toThrow()
    })
})
