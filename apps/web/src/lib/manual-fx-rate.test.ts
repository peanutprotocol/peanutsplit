import { describe, expect, it } from 'vitest'
import {
    convertMinorAtManualRate,
    formatManualFxRateInput,
    isManualFxRateInputAcceptable,
    parseManualFxRateInput,
} from './manual-fx-rate'

describe('parseManualFxRateInput', () => {
    it('canonicalises locale-aware positive decimals for the wire', () => {
        expect(parseManualFxRateInput(' 0.2500 ', 'en')).toBe('0.25')
        expect(parseManualFxRateInput('0,2500', 'pt-BR')).toBe('0.25')
        expect(parseManualFxRateInput('.5', 'en')).toBe('0.5')
        expect(parseManualFxRateInput('1,234', 'en')).toBe('1234')
    })

    it('enforces the Decimal(24,12) bounds without floating point', () => {
        expect(parseManualFxRateInput('0.000000000001', 'en')).toBe('0.000000000001')
        expect(parseManualFxRateInput('999999999999', 'en')).toBe('999999999999')
        expect(parseManualFxRateInput('0', 'en')).toBeNull()
        expect(parseManualFxRateInput('0.0000000000001', 'en')).toBeNull()
        expect(parseManualFxRateInput('1000000000000', 'en')).toBeNull()
        expect(parseManualFxRateInput('999999999999.000000000001', 'en')).toBeNull()
        expect(parseManualFxRateInput('1e2', 'en')).toBeNull()
    })

    it('allows useful incomplete prefixes while typing', () => {
        expect(isManualFxRateInputAcceptable('', 'en')).toBe(true)
        expect(isManualFxRateInputAcceptable('0.', 'en')).toBe(true)
        expect(isManualFxRateInputAcceptable('0.0', 'en')).toBe(true)
        expect(isManualFxRateInputAcceptable('-1', 'en')).toBe(false)
        expect(isManualFxRateInputAcceptable('1e', 'en')).toBe(false)
    })
})

describe('formatManualFxRateInput', () => {
    it('shows a frozen rate compactly in the active locale', () => {
        expect(formatManualFxRateInput('0.250000000000', 'en')).toBe('0.25')
        expect(formatManualFxRateInput('0.250000000000', 'pt-BR')).toBe('0,25')
        expect(formatManualFxRateInput('2.000000000000', 'es-419')).toBe('2')
        expect(formatManualFxRateInput('100.000000000000', 'en')).toBe('100')
        expect(formatManualFxRateInput('120.500000000000', 'pt-BR')).toBe('120,5')
    })
})

describe('convertMinorAtManualRate', () => {
    it('rounds half-up at the room minor-unit boundary', () => {
        // One BEER cent at 0.5 EUR/BEER is half a EUR cent.
        expect(convertMinorAtManualRate('1', '0.5', 2, 2)).toEqual({ status: 'ok', minor: '1' })
        // One whole BEER at 0.5 JPY/BEER is half a yen.
        expect(convertMinorAtManualRate('100', '0.5', 2, 0)).toEqual({ status: 'ok', minor: '1' })
    })

    it('reports a positive pair that rounds to zero', () => {
        expect(convertMinorAtManualRate('1', '0.000000000001', 2, 2)).toEqual({ status: 'zero' })
    })

    it('accepts the signed-BIGINT boundary and rejects one unit beyond it', () => {
        expect(convertMinorAtManualRate('9223372036854775807', '1', 2, 2)).toEqual({
            status: 'ok',
            minor: '9223372036854775807',
        })
        expect(convertMinorAtManualRate('9223372036854775807', '2', 2, 2)).toEqual({
            status: 'overflow',
        })
        expect(convertMinorAtManualRate('9223372036854775808', '0.1', 2, 2)).toEqual({
            status: 'overflow',
        })
    })

    it('preserves all high whole and fractional rate digits without Number', () => {
        expect(convertMinorAtManualRate('3001', '123456789012.123456789012', 2, 2)).toEqual({
            status: 'ok',
            minor: '370493823825382',
        })
    })

    it('is total for malformed rate and amount strings', () => {
        expect(convertMinorAtManualRate('100', '1e309', 2, 2)).toEqual({ status: 'invalid' })
        expect(convertMinorAtManualRate('1e309', '1', 2, 2)).toEqual({ status: 'invalid' })
    })
})
