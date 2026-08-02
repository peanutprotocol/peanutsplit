import { describe, expect, it } from 'vitest'
import {
    PULL_TO_REFRESH_AXIS_SLOP_PX,
    PULL_TO_REFRESH_MAX_DISTANCE_PX,
    PULL_TO_REFRESH_THRESHOLD_PX,
    pullAxis,
    pullIndicatorDistance,
    pullWillRefresh,
} from './pull-to-refresh'

describe('pull-to-refresh gesture geometry', () => {
    it('waits through touch noise before choosing a direction', () => {
        expect(pullAxis(PULL_TO_REFRESH_AXIS_SLOP_PX - 1, 1)).toBe('pending')
        expect(pullAxis(0, PULL_TO_REFRESH_AXIS_SLOP_PX)).toBe('down')
    })

    it('leaves horizontal and upward gestures to their own controls', () => {
        expect(pullAxis(20, 8)).toBe('horizontal')
        expect(pullAxis(2, -20)).toBe('up')
        expect(pullAxis(2, 20)).toBe('down')
    })

    it('resists the finger and caps the visual travel', () => {
        expect(pullIndicatorDistance(-20)).toBe(0)
        expect(pullIndicatorDistance(40)).toBe(22)
        expect(pullIndicatorDistance(1_000)).toBe(PULL_TO_REFRESH_MAX_DISTANCE_PX)
    })

    it('refreshes only once the deliberate threshold is reached', () => {
        expect(pullWillRefresh(PULL_TO_REFRESH_THRESHOLD_PX - 1)).toBe(false)
        expect(pullWillRefresh(PULL_TO_REFRESH_THRESHOLD_PX)).toBe(true)
    })
})
