export const SLIDE_CONFIRM_THRESHOLD = 0.88

export const clampSlideProgress = (progress: number): number => Math.min(1, Math.max(0, progress))

export const slideProgressFromDrag = (startProgress: number, deltaX: number, travel: number): number => {
    if (travel <= 0) return 0
    return clampSlideProgress(startProgress + deltaX / travel)
}

export const slideWillConfirm = (progress: number): boolean => progress >= SLIDE_CONFIRM_THRESHOLD
