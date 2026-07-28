'use client'

/**
 * The scan, end to end: downscale → read → review → assign → hand back.
 *
 * It hands back. That is the design decision worth defending: this flow never
 * creates an expense. It produces `ExpenseFormValues` and gives them to the
 * drawer that was already open, and the user saves through the same button,
 * the same validation and the same POST as a hand-typed expense. One money
 * path, already tested — a "save scan" endpoint would be a second way to write
 * shares into a room, with its own FX handling and its own rounding, for the
 * sake of skipping a tap the user wants anyway.
 *
 * Rendered through a portal rather than inside the drawer: vaul transforms the
 * sheet while it opens and drags, and a `position: fixed` child of a transformed
 * ancestor is positioned against that ancestor instead of the viewport — the
 * overlay would arrive one drag gesture away from being visibly wrong.
 */

import { useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { api, isApiError } from '@/lib/api'
import type { ApiMember, CurrencyInfo } from '@/lib/api-types'
import { roomProps, track } from '@/lib/analytics'
import { useErrorMessage } from '@/lib/error-messages'
import type { ExpenseFormValues } from '@/lib/expense-form'
import { decimalsOf, formatMinorPlain } from '@/lib/money'
import { useFeedback } from '@/lib/use-settings'
import { ScanAssign } from './ScanAssign'
import { ScanReview } from './ScanReview'
import { ScanningAnimation } from './ScanningAnimation'
import { ImageTooLargeError, ImageUnreadableError, prepareReceiptImage } from './scan-image'
import { initScanState, scanReducer, toExpenseFormValues, type ScanState } from './scan-state'

interface ScanFlowProps {
    /** The picked photo. A new file restarts the flow from scratch. */
    file: File
    slug: string
    token?: string | null
    members: readonly ApiMember[]
    roomCurrency: string
    currencies: readonly CurrencyInfo[]
    /** The drawer's current form values — the scan patches these rather than
     *  replacing them, so the payer the user already picked survives. */
    baseValues: ExpenseFormValues
    onCancel: () => void
    onApply: (values: ExpenseFormValues) => void
}

type Phase = 'scanning' | 'review' | 'assign' | 'error'

/** A reducer needs a state to start from; the real one arrives with the parse. */
const EMPTY: ScanState = {
    items: [],
    assignments: {},
    receiptTotalMinor: null,
    currency: 'USD',
    merchant: null,
    date: null,
}

export function ScanFlow({
    file,
    slug,
    token,
    members,
    roomCurrency,
    currencies,
    baseValues,
    onCancel,
    onApply,
}: ScanFlowProps) {
    const t = useTranslations('room.scan')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()

    const [phase, setPhase] = useState<Phase>('scanning')
    const [error, setError] = useState<string | null>(null)
    const [state, dispatch] = useReducer(scanReducer, EMPTY)
    const [mounted, setMounted] = useState(false)
    /** Strict mode runs effects twice in development, and a second vision call
     *  per photo is a real bill on a real API key. */
    const scanned = useRef<File | null>(null)

    useEffect(() => setMounted(true), [])

    useEffect(() => {
        if (scanned.current === file) return
        scanned.current = file
        let cancelled = false

        const run = async () => {
            setPhase('scanning')
            setError(null)
            track('receipt_scan_started', roomProps(slug))
            try {
                const image = await prepareReceiptImage(file)
                const parsed = await api.receipt.parse(slug, image, token)
                if (cancelled) return
                const decimals = decimalsOf(parsed.currency ?? roomCurrency, currencies)
                dispatch({
                    type: 'reset',
                    state: initScanState(parsed, {
                        fallbackCurrency: roomCurrency,
                        toInput: (minor) => formatMinorPlain(minor, decimals),
                    }),
                })
                // Count only. What was on the receipt is between the user and
                // their dinner — see the note on the event union.
                track('receipt_scan_parsed', roomProps(slug, { items: parsed.items.length }))
                feedback('pop')
                setPhase('review')
            } catch (err) {
                if (cancelled) return
                feedback('error', { haptic: 'error' })
                setPhase('error')
                if (err instanceof ImageTooLargeError) {
                    setError(t('errors.tooLarge'))
                    track('receipt_scan_failed', roomProps(slug, { reason: 'image_too_large' }))
                    return
                }
                if (err instanceof ImageUnreadableError) {
                    setError(t('errors.unreadable'))
                    track('receipt_scan_failed', roomProps(slug, { reason: 'image_unreadable' }))
                    return
                }
                setError(errorMessage(err, t('errors.generic')))
                track(
                    'receipt_scan_failed',
                    // A stable failure code, never a message: messages carry the
                    // server's English and could one day carry an echo of input.
                    roomProps(slug, { reason: isApiError(err) ? err.code : 'unknown' })
                )
            }
        }

        void run()
        return () => {
            cancelled = true
        }
        // `t`, `feedback` and friends are stable enough that re-running on their
        // identity would mean re-scanning the same photo — the one thing this
        // effect must never do.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file, slug, token])

    const decimals = decimalsOf(state.currency, currencies)

    const apply = () => {
        const values = toExpenseFormValues(state, {
            base: baseValues,
            decimals,
            fallbackDescription: t('defaultDescription'),
        })
        track(
            'receipt_scan_applied',
            roomProps(slug, { items: state.items.length, people: Object.keys(values.exactInputs).length })
        )
        feedback('tick', { haptic: 'confirm' })
        onApply(values)
    }

    if (!mounted) return null

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t('cta')}
            data-testid="scan-flow"
            className="fixed inset-0 z-[60] overflow-y-auto bg-background"
        >
            <div className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-5 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
                <div className="flex items-center justify-between">
                    <span className="text-h8 uppercase tracking-wide text-grey-1">
                        {phase === 'assign' ? t('step2') : t('step1')}
                    </span>
                    <button
                        type="button"
                        onClick={onCancel}
                        aria-label={t('cancel')}
                        data-testid="scan-close"
                        className="flex size-11 items-center justify-center rounded-sm border border-n-1 bg-white"
                    >
                        <Icon name="x" size={18} />
                    </button>
                </div>

                {phase === 'scanning' && <ScanningAnimation />}

                {phase === 'error' && (
                    <div className="flex flex-col gap-3 py-8">
                        <p role="alert" className="text-h7 text-error">
                            {error}
                        </p>
                        <p className="text-sm text-grey-1">{t('errors.hint')}</p>
                        <Button variant="stroke" onClick={onCancel} className="justify-center">
                            {t('cancel')}
                        </Button>
                    </div>
                )}

                {phase === 'review' && (
                    <ScanReview
                        state={state}
                        dispatch={dispatch}
                        decimals={decimals}
                        currencies={currencies}
                        onContinue={() => {
                            feedback('whoosh')
                            setPhase('assign')
                        }}
                        onCancel={onCancel}
                    />
                )}

                {phase === 'assign' && (
                    <ScanAssign
                        state={state}
                        dispatch={dispatch}
                        members={members}
                        decimals={decimals}
                        currencies={currencies}
                        onBack={() => setPhase('review')}
                        onApply={apply}
                    />
                )}
            </div>
        </div>,
        document.body
    )
}
