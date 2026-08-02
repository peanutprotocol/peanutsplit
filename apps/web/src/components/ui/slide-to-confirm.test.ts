import { describe, expect, it } from 'vitest'
import {
    SLIDE_CONFIRM_THRESHOLD,
    clampSlideProgress,
    slideProgressFromDrag,
    slideWillConfirm,
} from './slide-to-confirm'

describe('slide-to-confirm geometry', () => {
    it('clamps progress to the track', () => {
        expect(clampSlideProgress(-0.2)).toBe(0)
        expect(clampSlideProgress(0.4)).toBe(0.4)
        expect(clampSlideProgress(1.2)).toBe(1)
    })

    it('measures a drag against the available handle travel', () => {
        expect(slideProgressFromDrag(0, 45, 100)).toBe(0.45)
        expect(slideProgressFromDrag(0.25, 25, 100)).toBe(0.5)
        expect(slideProgressFromDrag(0.25, -50, 100)).toBe(0)
    })

    it('stays safe when the track has no usable travel', () => {
        expect(slideProgressFromDrag(0.5, 100, 0)).toBe(0)
        expect(slideProgressFromDrag(0.5, 100, -10)).toBe(0)
    })

    it('confirms only at or beyond the deliberate threshold', () => {
        expect(slideWillConfirm(SLIDE_CONFIRM_THRESHOLD - 0.001)).toBe(false)
        expect(slideWillConfirm(SLIDE_CONFIRM_THRESHOLD)).toBe(true)
        expect(slideWillConfirm(1)).toBe(true)
    })
})
