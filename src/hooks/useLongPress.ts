import { useCallback, useEffect, useRef, useState } from 'react'

export interface LongPressOptions {
    duration?: number // Duration in milliseconds (default: 2000)
    onLongPress?: () => void
    onLongPressStart?: () => void
    onLongPressEnd?: () => void
}

export interface LongPressReturn {
    isLongPressed: boolean
    pressProgress: number
    handlers: {
        onMouseDown: () => void
        onMouseUp: () => void
        onMouseLeave: () => void
        onTouchStart: () => void
        onTouchEnd: () => void
        onTouchCancel: () => void
    }
}

export function useLongPress(options: LongPressOptions | undefined): LongPressReturn {
    const [isLongPressed, setIsLongPressed] = useState(false)
    const [pressProgress, setPressProgress] = useState(0)

    const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const isLongPressedRef = useRef(false)

    // Keep ref in sync for use in callbacks without stale closures
    isLongPressedRef.current = isLongPressed

    const clearTimers = useCallback(() => {
        if (pressTimerRef.current) {
            clearTimeout(pressTimerRef.current)
            pressTimerRef.current = null
        }
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current)
            progressIntervalRef.current = null
        }
    }, [])

    const handlePressStart = useCallback(() => {
        if (!options) return

        options.onLongPressStart?.()
        setPressProgress(0)

        const duration = options.duration || 2000
        const updateInterval = 16 // ~60fps
        const increment = (100 / duration) * updateInterval

        const progressTimer = setInterval(() => {
            setPressProgress((prev) => {
                const newProgress = prev + increment
                if (newProgress >= 100) {
                    clearInterval(progressTimer)
                    return 100
                }
                return newProgress
            })
        }, updateInterval)

        progressIntervalRef.current = progressTimer

        const timer = setTimeout(() => {
            setIsLongPressed(true)
            options.onLongPress?.()
            clearInterval(progressTimer)
        }, duration)

        pressTimerRef.current = timer
    }, [options])

    const handlePressEnd = useCallback(() => {
        if (!options) return

        clearTimers()

        if (isLongPressedRef.current) {
            options.onLongPressEnd?.()
            setIsLongPressed(false)
        }

        setPressProgress(0)
    }, [options, clearTimers])

    const handlePressCancel = useCallback(() => {
        if (!options) return

        clearTimers()
        setIsLongPressed(false)
        setPressProgress(0)
    }, [options, clearTimers])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearTimers()
        }
    }, [clearTimers])

    return {
        isLongPressed,
        pressProgress,
        handlers: {
            onMouseDown: handlePressStart,
            onMouseUp: handlePressEnd,
            onMouseLeave: handlePressCancel,
            onTouchStart: handlePressStart,
            onTouchEnd: handlePressEnd,
            onTouchCancel: handlePressCancel,
        },
    }
}
