import { describe, expect, it } from 'vitest'
import { currencyMenuPlacement } from './CurrencySelect'

const trigger = (top: number, bottom: number, left = 24, width = 136) => ({
    top,
    bottom,
    left,
    right: left + width,
    width,
})

describe('currencyMenuPlacement', () => {
    it('opens downward when the trigger is near the top of the sheet', () => {
        const placement = currencyMenuPlacement(trigger(120, 168), { width: 390, height: 844 }, 12)

        expect(placement.direction).toBe('down')
        expect(placement.top).toBe(176)
        expect(placement.left).toBe(24)
        expect(placement.maxHeight).toBe(256)
    })

    it('flips upward only when the space above is genuinely better', () => {
        const placement = currencyMenuPlacement(trigger(720, 768), { width: 390, height: 844 }, 12)

        expect(placement.direction).toBe('up')
        expect(placement.top).toBe(456)
        expect(placement.maxHeight).toBe(256)
    })

    it('shifts a wide trigger inside the visible viewport gutter', () => {
        const placement = currencyMenuPlacement(trigger(200, 248, 330, 90), { width: 390, height: 844 }, 4)

        expect(placement.left).toBe(202)
        expect(placement.width).toBe(176)
        expect(placement.left + placement.width).toBeLessThanOrEqual(378)
    })

    it('respects visual viewport offsets from a mobile keyboard', () => {
        const placement = currencyMenuPlacement(trigger(390, 438), { width: 390, height: 420, offsetTop: 180 }, 12)

        expect(placement.direction).toBe('up')
        expect(placement.top).toBeGreaterThanOrEqual(192)
    })

    it('shrinks rather than escaping when neither side has room for a full menu', () => {
        const placement = currencyMenuPlacement(trigger(42, 90), { width: 320, height: 140 }, 12)

        expect(placement.direction).toBe('down')
        expect(placement.maxHeight).toBe(30)
        expect(placement.top + placement.maxHeight).toBe(128)
    })
})
