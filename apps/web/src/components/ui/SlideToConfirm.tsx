'use client'

import {
    type HTMLAttributes,
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { useFeedback } from '@/lib/use-settings'
import { Icon } from './Icon'
import Loading from './Loading'
import { clampSlideProgress, slideProgressFromDrag, slideWillConfirm } from './slide-to-confirm'

const HANDLE_SIZE_PX = 44
const TRACK_INSET_PX = 4

type ConfirmationResult = boolean | void | Promise<boolean | void>

interface SlideToConfirmProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    | 'children'
    | 'onClick'
    | 'onPointerDown'
    | 'onPointerMove'
    | 'onPointerUp'
    | 'onPointerCancel'
    | 'onLostPointerCapture'
> {
    label: string
    loadingLabel?: string
    loading?: boolean
    disabled?: boolean
    onConfirm: () => ConfirmationResult
    onCancel?: () => void
}

/**
 * A deliberate terminal action: pointer users drag the handle, while keyboard
 * and assistive-technology users adjust the slider or use Enter/Space.
 *
 * The warning and cancel path stay outside this component. It owns only the
 * final command, which keeps every destructive surface consistent without
 * making an ordinary Button responsible for drag geometry.
 */
export function SlideToConfirm({
    label,
    loadingLabel,
    loading = false,
    disabled = false,
    className,
    onConfirm,
    onCancel,
    onBlur,
    onKeyDown,
    'aria-describedby': ariaDescribedBy,
    ...props
}: SlideToConfirmProps) {
    const t = useTranslations('slideToConfirm')
    const feedback = useFeedback()
    const instructionId = useId()
    const controlRef = useRef<HTMLDivElement>(null)
    const pointerIdRef = useRef<number | null>(null)
    const startXRef = useRef(0)
    const startProgressRef = useRef(0)
    const progressRef = useRef(0)
    const confirmedRef = useRef(false)
    const thresholdCueRef = useRef(false)
    const wasLoadingRef = useRef(false)
    const [progress, setProgressState] = useState(0)
    const [dragging, setDragging] = useState(false)

    const setProgress = useCallback((next: number) => {
        progressRef.current = next
        setProgressState(next)
    }, [])

    const reset = useCallback(
        (focus = false) => {
            pointerIdRef.current = null
            confirmedRef.current = false
            thresholdCueRef.current = false
            setDragging(false)
            setProgress(0)
            if (focus) window.requestAnimationFrame(() => controlRef.current?.focus())
        },
        [setProgress]
    )

    useEffect(() => {
        if (loading) {
            wasLoadingRef.current = true
            setProgress(1)
            return
        }
        if (wasLoadingRef.current) {
            wasLoadingRef.current = false
            reset(true)
        }
    }, [loading, reset, setProgress])

    useEffect(() => {
        if (disabled && !loading) reset()
    }, [disabled, loading, reset])

    const confirm = useCallback(() => {
        if (disabled || loading || confirmedRef.current) return
        confirmedRef.current = true
        setDragging(false)
        setProgress(1)

        try {
            const result = onConfirm()
            if (result === false) {
                reset(true)
                return
            }
            if (result instanceof Promise) {
                void result.then((succeeded) => succeeded === false && reset(true)).catch(() => reset(true))
            }
        } catch {
            reset(true)
        }
    }, [disabled, loading, onConfirm, reset, setProgress])

    const progressAt = useCallback((clientX: number) => {
        const track = controlRef.current
        if (!track) return 0
        const travel = track.getBoundingClientRect().width - HANDLE_SIZE_PX - TRACK_INSET_PX * 2
        return slideProgressFromDrag(startProgressRef.current, clientX - startXRef.current, travel)
    }, [])

    const updateDrag = useCallback(
        (next: number) => {
            setProgress(next)
            const ready = slideWillConfirm(next)
            if (ready && !thresholdCueRef.current) {
                thresholdCueRef.current = true
                feedback('tick')
            }
        },
        [feedback, setProgress]
    )

    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (
            disabled ||
            loading ||
            confirmedRef.current ||
            !event.isPrimary ||
            event.button !== 0 ||
            !(event.target as Element).closest('[data-slide-handle]')
        )
            return

        event.preventDefault()
        pointerIdRef.current = event.pointerId
        startXRef.current = event.clientX
        startProgressRef.current = progressRef.current
        thresholdCueRef.current = slideWillConfirm(progressRef.current)
        setDragging(true)
        event.currentTarget.setPointerCapture(event.pointerId)
    }

    const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (pointerIdRef.current !== event.pointerId) return
        updateDrag(progressAt(event.clientX))
    }

    const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (pointerIdRef.current !== event.pointerId) return
        const finalProgress = progressAt(event.clientX)
        pointerIdRef.current = null
        setDragging(false)
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
        if (slideWillConfirm(finalProgress)) confirm()
        else reset()
    }

    const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (pointerIdRef.current !== event.pointerId) return
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
        reset()
    }

    const handleLostPointerCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (pointerIdRef.current === event.pointerId) reset()
    }

    const displayLabel = loading ? (loadingLabel ?? t('working')) : slideWillConfirm(progress) ? t('release') : label
    const progressPercent = Math.round(progress * 100)
    const handleLeft = `calc(0.25rem + ${progressPercent}% - ${(progress * 3.25).toFixed(3)}rem)`

    return (
        <div
            {...props}
            ref={controlRef}
            role="slider"
            tabIndex={disabled || loading ? -1 : 0}
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-valuetext={t('progress', { progress: progressPercent })}
            aria-disabled={disabled || loading || undefined}
            aria-busy={loading || undefined}
            aria-describedby={[ariaDescribedBy, instructionId].filter(Boolean).join(' ')}
            data-progress={progressPercent}
            className={cn(
                'relative h-13 w-full touch-pan-y select-none overflow-hidden rounded-sm border-2 border-n-1 bg-white text-n-1 shadow-[0.25rem_0.25rem_0_#211C17] outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2',
                (disabled || loading) && 'cursor-not-allowed opacity-60',
                className
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handleLostPointerCapture}
            onBlur={(event) => {
                if (!loading && !confirmedRef.current && progressRef.current > 0) reset()
                onBlur?.(event)
            }}
            onKeyDown={(event) => {
                if (disabled || loading) {
                    onKeyDown?.(event)
                    return
                }
                if (event.key === 'Escape') {
                    event.preventDefault()
                    reset()
                    onCancel?.()
                } else if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                    event.preventDefault()
                    confirm()
                } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    const next = clampSlideProgress(progressRef.current + 0.25)
                    if (slideWillConfirm(next)) confirm()
                    else updateDrag(next)
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                    event.preventDefault()
                    updateDrag(clampSlideProgress(progressRef.current - 0.25))
                } else if (event.key === 'Home') {
                    event.preventDefault()
                    reset()
                } else if (event.key === 'End') {
                    event.preventDefault()
                    confirm()
                }
                onKeyDown?.(event)
            }}
        >
            <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-error-1"
                style={{ width: `${progressPercent}%` }}
            />
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center px-14 text-sm font-bold"
            >
                <span className="truncate">{displayLabel}</span>
                {loading && <Loading className="ml-2 size-4" />}
            </span>
            <span
                data-slide-handle
                aria-hidden="true"
                className={cn(
                    'absolute top-1 flex size-11 items-center justify-center rounded-sm border border-n-1 bg-error-1 shadow-[0.125rem_0.125rem_0_#211C17]',
                    !dragging && 'transition-[left] duration-150 ease-out'
                )}
                style={{ left: handleLeft }}
            >
                <Icon name={loading ? 'check' : 'arrow-right'} size={20} />
            </span>
            <span id={instructionId} className="sr-only">
                {t('instructions')} {t('progress', { progress: progressPercent })}
            </span>
        </div>
    )
}
