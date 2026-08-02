/** The finger travel that makes releasing a deliberate refresh. */
export const PULL_TO_REFRESH_THRESHOLD_PX = 80

/** The indicator moves less than the finger, like the elastic edge of a native scroller. */
export const PULL_TO_REFRESH_RESISTANCE = 0.55
export const PULL_TO_REFRESH_MAX_DISTANCE_PX = 68

/** Do not choose an axis for tiny, noisy movements at the start of a touch. */
export const PULL_TO_REFRESH_AXIS_SLOP_PX = 6

export type PullAxis = 'pending' | 'horizontal' | 'up' | 'down'

export function pullAxis(deltaX: number, deltaY: number): PullAxis {
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < PULL_TO_REFRESH_AXIS_SLOP_PX) return 'pending'
    if (Math.abs(deltaX) > Math.abs(deltaY)) return 'horizontal'
    return deltaY > 0 ? 'down' : 'up'
}

export function pullIndicatorDistance(deltaY: number): number {
    return Math.min(Math.max(0, deltaY) * PULL_TO_REFRESH_RESISTANCE, PULL_TO_REFRESH_MAX_DISTANCE_PX)
}

export function pullWillRefresh(deltaY: number): boolean {
    return deltaY >= PULL_TO_REFRESH_THRESHOLD_PX
}
