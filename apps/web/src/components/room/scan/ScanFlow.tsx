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
 *
 * THE TAP TRAP, and why the two lines guarding against it are not decoration.
 * The drawer that owns this flow is a modal Radix layer, and for as long as one
 * is mounted Radix sets `document.body { pointer-events: none }` and re-enables
 * pointer events only on its own content. A portal into `document.body` is a
 * sibling of that content, not a nested layer, so it inherited `none`: the
 * overlay painted on top, took no taps at all, and every tap went to the drawer
 * still live underneath it. The structural half of the fix is in
 * `ExpenseDrawer` — the drawer closes while a scan is up, so only one modal
 * layer exists at a time. The half that lives here is `pointer-events: auto` on
 * this root, which covers the window the structural fix cannot: the drawer's
 * exit animation keeps Radix's layer mounted for a few hundred milliseconds
 * after this overlay appears, and a surface that is visible must never be a
 * surface that cannot be touched.
 */

import { useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { api, isApiError } from '@/lib/api'
import type { ApiMember, CurrencyInfo, ParsedReceipt } from '@/lib/api-types'
import { roomProps, track } from '@/lib/analytics'
import { useErrorMessage } from '@/lib/error-messages'
import type { ExpenseFormValues } from '@/lib/expense-form'
import { decimalsOf, formatAmountInput } from '@/lib/money'
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
    const locale = useLocale()
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()

    const [phase, setPhase] = useState<Phase>('scanning')
    const [error, setError] = useState<string | null>(null)
    const [state, dispatch] = useReducer(scanReducer, EMPTY)
    const [mounted, setMounted] = useState(false)
    /**
     * The in-flight read for THIS photo, memoised across effect runs.
     *
     * A ref that only remembered "already scanned this file" deadlocked the
     * screen, and it is the second half of the lifecycle bug this flow was held
     * back for. React runs an effect, tears it down and runs it again on mount
     * in development — and will do the same in production whenever a tree is
     * remounted. Under that, the first run started the read and was then marked
     * cancelled by its own cleanup, while the second run saw the file was
     * "already scanned" and returned without starting anything. Nobody was left
     * to apply a result: the overlay sat on "Reading the bill…" forever, with a
     * cancel button and nothing else.
     *
     * Holding the PROMISE instead of a flag fixes both halves at once — the
     * second run awaits the same read rather than starting a second one (a
     * vision call is a real bill on a real API key), and whichever run is still
     * alive when it lands is the one that applies it.
     */
    const read = useRef<{ file: File; promise: Promise<ParsedReceipt> } | null>(null)
    const rootRef = useRef<HTMLDivElement>(null)

    useEffect(() => setMounted(true), [])

    /**
     * Dialog focus, both ways — and the second half is not politeness.
     *
     * Taking focus is the ordinary reason: a screen reader lands on the dialog
     * rather than staying on the button that opened it, and a caret left in one
     * of the drawer's fields does not keep receiving the keyboard from under a
     * full-screen overlay.
     *
     * GIVING IT BACK is what stops the drawer beneath from dismissing itself as
     * this overlay unmounts. The drawer is a Radix layer that watches for focus
     * leaving it; when a focused element inside this overlay disappears, focus
     * falls to `<body>`, Radix reads that as an interaction outside the sheet
     * and closes it — taking the URL state, and therefore the reviewed bill's
     * destination, with it. Putting focus back where it came from means focus
     * never leaves the layer at all. The restore runs in the cleanup, which
     * React runs before it detaches this subtree, so the target is still there.
     */
    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null
        return () => {
            if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true })
        }
    }, [])

    useEffect(() => {
        if (mounted) rootRef.current?.focus({ preventScroll: true })
    }, [mounted])

    useEffect(() => {
        let cancelled = false

        /** Started at most once per photo, however many times this effect runs. */
        const readOnce = (): Promise<ParsedReceipt> => {
            if (read.current?.file !== file) {
                read.current = {
                    file,
                    promise: (async () => {
                        track('receipt_scan_started', roomProps(slug))
                        const image = await prepareReceiptImage(file)
                        return api.receipt.parse(slug, image, token)
                    })(),
                }
            }
            return read.current.promise
        }

        const run = async () => {
            setPhase('scanning')
            setError(null)
            try {
                const parsed = await readOnce()
                if (cancelled) return
                const decimals = decimalsOf(parsed.currency ?? roomCurrency, currencies)
                dispatch({
                    type: 'reset',
                    state: initScanState(parsed, {
                        fallbackCurrency: roomCurrency,
                        toInput: (minor) => formatAmountInput(minor, decimals, locale),
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
            locale,
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
            ref={rootRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('cta')}
            data-testid="scan-flow"
            // Focusable so the overlay can take focus off whatever is behind it —
            // see the note at the top of the file.
            tabIndex={-1}
            className="pointer-events-auto fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-background"
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
