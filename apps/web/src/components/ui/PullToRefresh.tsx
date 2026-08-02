'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMotionAllowed } from '@/lib/use-motion'
import { Doodle } from './Doodle'
import { pullAxis, pullIndicatorDistance, pullWillRefresh } from './pull-to-refresh'

type PullPhase = 'idle' | 'pulling' | 'armed' | 'refreshing'

interface PullToRefreshLabels {
    pull: string
    release: string
    refreshing: string
}

interface PullToRefreshProps {
    enabled?: boolean
    labels: PullToRefreshLabels
    onRefresh: () => unknown | Promise<unknown>
}

const REFRESHING_DISTANCE_PX = 54

/**
 * Mobile pull-to-refresh for screens whose data can be refreshed in place.
 *
 * The browser gesture is disabled globally because Split is an installed PWA.
 * This replacement keeps the current room mounted (and therefore keeps its
 * cached ledger on a failed request) while giving iOS and Android the same
 * threshold and feedback.
 */
export function PullToRefresh({ enabled = true, labels, onRefresh }: PullToRefreshProps) {
    const motionAllowed = useMotionAllowed()
    const [phase, setPhase] = useState<PullPhase>('idle')
    const [distance, setDistance] = useState(0)
    const enabledRef = useRef(enabled)
    const refreshRef = useRef(onRefresh)
    const mountedRef = useRef(true)
    const activeRef = useRef(false)
    const startXRef = useRef(0)
    const startYRef = useRef(0)
    const deltaYRef = useRef(0)
    const phaseRef = useRef<PullPhase>('idle')

    enabledRef.current = enabled
    refreshRef.current = onRefresh

    const changePhase = useCallback((next: PullPhase) => {
        phaseRef.current = next
        setPhase(next)
    }, [])

    const reset = useCallback(() => {
        activeRef.current = false
        deltaYRef.current = 0
        setDistance(0)
        changePhase('idle')
    }, [changePhase])

    useEffect(() => {
        if (!enabled && phaseRef.current !== 'refreshing') reset()
    }, [enabled, reset])

    useEffect(() => {
        mountedRef.current = true

        const pageAtTop = () => window.scrollY <= 0 && (document.scrollingElement?.scrollTop ?? 0) <= 0

        const onTouchStart = (event: TouchEvent) => {
            if (activeRef.current && event.touches.length !== 1) {
                reset()
                return
            }
            if (
                !enabledRef.current ||
                phaseRef.current === 'refreshing' ||
                event.touches.length !== 1 ||
                !pageAtTop() ||
                // Vaul sheets and the join/install dialogs own their vertical gesture.
                document.querySelector('[role="dialog"]')
            )
                return

            const target = event.target
            if (
                target instanceof Element &&
                target.closest('input, textarea, select, [contenteditable="true"], [data-pull-to-refresh-ignore]')
            )
                return

            const touch = event.touches[0]
            activeRef.current = true
            startXRef.current = touch.clientX
            startYRef.current = touch.clientY
            deltaYRef.current = 0
        }

        const onTouchMove = (event: TouchEvent) => {
            if (!activeRef.current) return
            if (event.touches.length !== 1) {
                reset()
                return
            }

            const touch = event.touches[0]
            const deltaX = touch.clientX - startXRef.current
            const deltaY = touch.clientY - startYRef.current
            const axis = pullAxis(deltaX, deltaY)

            if (axis === 'pending') return
            if (axis !== 'down' || !pageAtTop()) {
                reset()
                return
            }

            // Once a top-edge vertical pull is established, suppress the browser's
            // own rubber band/navigation handling and let this indicator own it.
            event.preventDefault()
            deltaYRef.current = deltaY
            setDistance(pullIndicatorDistance(deltaY))
            changePhase(pullWillRefresh(deltaY) ? 'armed' : 'pulling')
        }

        const onTouchEnd = (event: TouchEvent) => {
            if (!activeRef.current) return
            if (event.touches.length > 0) {
                reset()
                return
            }
            activeRef.current = false

            if (!pullWillRefresh(deltaYRef.current)) {
                reset()
                return
            }

            deltaYRef.current = 0
            setDistance(REFRESHING_DISTANCE_PX)
            changePhase('refreshing')

            void Promise.resolve()
                .then(() => refreshRef.current())
                // The room owns failure feedback through its stale/error state.
                .catch(() => undefined)
                .finally(() => {
                    if (mountedRef.current) reset()
                })
        }

        const onTouchCancel = () => {
            if (phaseRef.current !== 'refreshing') reset()
        }

        document.addEventListener('touchstart', onTouchStart, { passive: true })
        document.addEventListener('touchmove', onTouchMove, { passive: false })
        document.addEventListener('touchend', onTouchEnd, { passive: true })
        document.addEventListener('touchcancel', onTouchCancel, { passive: true })

        return () => {
            mountedRef.current = false
            document.removeEventListener('touchstart', onTouchStart)
            document.removeEventListener('touchmove', onTouchMove)
            document.removeEventListener('touchend', onTouchEnd)
            document.removeEventListener('touchcancel', onTouchCancel)
        }
    }, [changePhase, reset])

    const active = phase !== 'idle'
    const label = phase === 'armed' ? labels.release : phase === 'refreshing' ? labels.refreshing : labels.pull
    const transition =
        motionAllowed && phase !== 'pulling' && phase !== 'armed'
            ? 'transform 160ms ease-out, opacity 160ms ease-out'
            : 'none'

    return (
        <>
            <div
                aria-hidden="true"
                data-testid="pull-to-refresh-indicator"
                data-phase={phase}
                className="shadow-3 pointer-events-none fixed left-1/2 top-[max(0.5rem,env(safe-area-inset-top))] z-40 flex items-center gap-2 rounded-full border border-n-1 bg-white px-3 py-2 text-sm font-bold"
                style={{
                    opacity: active ? 1 : 0,
                    transform: `translate(-50%, calc(-100% - 0.5rem + ${distance}px))`,
                    transition,
                }}
            >
                <Doodle
                    name={phase === 'refreshing' ? 'iconsparkles' : 'iconchevrondown'}
                    size={20}
                    weight={2.2}
                    className={phase === 'refreshing' && motionAllowed ? 'animate-spin' : undefined}
                    style={{
                        transform: phase === 'armed' ? 'rotate(180deg)' : undefined,
                        transition: motionAllowed ? 'transform 120ms ease-out' : 'none',
                    }}
                />
                <span>{label}</span>
            </div>
            <span className="sr-only" aria-live="polite">
                {phase === 'refreshing' ? labels.refreshing : ''}
            </span>
        </>
    )
}
