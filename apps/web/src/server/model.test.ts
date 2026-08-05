import { describe, expect, it } from 'vitest'
import { coerceCurrency } from '@/server/model'

/**
 * The gate on a currency a language model guessed from a receipt photo.
 *
 * Its whole job is to be graceful: every caller falls back to the room's currency when this
 * returns null, so a wrong guess costs nothing. Widening the catalog from 12 codes to 162 is
 * exactly the change that could have turned that into a hard failure — a scanned code the room
 * cannot price would now be carried into the create and rejected there with NO_RATE.
 */
describe('coerceCurrency', () => {
    it('keeps a real code the room can price', () => {
        expect(coerceCurrency('EUR', 'EUR')).toBe('EUR')
        expect(coerceCurrency('THB', 'EUR')).toBe('THB')
        // Wide catalog: this is the point of the change.
        expect(coerceCurrency('INR', 'EUR')).toBe('INR')
        expect(coerceCurrency('KWD', 'JPY')).toBe('KWD')
    })

    it('normalises what the model wrote', () => {
        expect(coerceCurrency('  eur ', 'USD')).toBe('EUR')
        expect(coerceCurrency('usd', 'EUR')).toBe('USD')
    })

    it('drops anything that is not a code, so the room currency is used instead', () => {
        for (const raw of ['euros', 'US', '€', '', 'US1', 'ЕUR', 12, null, undefined, {}]) {
            expect(coerceCurrency(raw, 'EUR')).toBeNull()
        }
    })

    /** The D7 rule. A guess the room cannot convert is worse than no guess. */
    it('drops a code the room currency has no rate to', () => {
        // A real catalog code the feed does not carry.
        expect(coerceCurrency('KPW', 'EUR')).toBeNull()
        // A real code, in a room that settles in a made-up ticker.
        expect(coerceCurrency('EUR', 'BEER')).toBeNull()
        // Two made-up tickers never convert to each other.
        expect(coerceCurrency('DOGE', 'BEER')).toBeNull()
    })

    it('keeps the room currency itself, whatever it is', () => {
        expect(coerceCurrency('BEER', 'BEER')).toBe('BEER')
        expect(coerceCurrency('beer', 'BEER')).toBe('BEER')
        expect(coerceCurrency('KPW', 'KPW')).toBe('KPW')
    })
})
