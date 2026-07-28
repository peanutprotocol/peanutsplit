'use client'

/**
 * The other way in: type it, or paste it out of the chat.
 *
 * It sits beside the scan chip, under the amount field, for the same reason that
 * one does — this is the moment the shortcut is worth taking, and a row of its
 * own at the top would read as a mode ("quick mode vs manual mode"), which it
 * isn't. The chip IS the toggle: tapping it again closes the sheet, so there is
 * no cancel button to explain and no state where the sheet is open with no way
 * back.
 *
 * On success the form fills and the sheet closes, and the user is left standing
 * in the ORDINARY expense form with everything in it — exactly where the scan
 * flow leaves them. Nothing here creates an expense; `onApply` hands over form
 * values and the drawer's save button is still the only thing that writes.
 *
 * What is deliberately absent: a preview of what the model read, a confirm step,
 * a list of what it matched. The form below is all three of those, already
 * built, already editable, and already the thing the user has to look at anyway.
 */

import { useState } from 'react'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { api, isApiError } from '@/lib/api'
import type { CurrencyInfo } from '@/lib/api-types'
import { roomProps, track } from '@/lib/analytics'
import { cn } from '@/lib/cn'
import { useErrorMessage } from '@/lib/error-messages'
import type { ExpenseFormValues } from '@/lib/expense-form'
import { MAX_NL_TEXT_CHARS, draftToFormValues } from '@/lib/quick-add'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'

interface QuickAddProps {
    slug: string
    roomCurrency: string
    currencies: readonly CurrencyInfo[]
    /** The drawer's current values — a draft patches these rather than replacing
     *  them, so a payer picked before typing survives a line that names nobody. */
    values: ExpenseFormValues
    onApply: (values: ExpenseFormValues) => void
}

export function QuickAdd({ slug, roomCurrency, currencies, values, onApply }: QuickAddProps) {
    const t = useTranslations('room.quickAdd')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()

    const [open, setOpen] = useState(false)
    const [text, setText] = useState('')
    const [parsing, setParsing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    /**
     * Names the room could not resolve, kept AFTER the sheet closes: the whole
     * point of showing them is that the person is now looking at the chips they
     * need to tap, and a message that vanished with the sheet would be a message
     * nobody read.
     */
    const [unmatched, setUnmatched] = useState<string[]>([])

    const parse = async () => {
        const trimmed = text.trim()
        if (trimmed.length === 0 || parsing) return
        setParsing(true)
        setError(null)
        track('nl_parse_started', roomProps(slug))
        try {
            const { draft, unmatchedNames } = await api.parseExpenseText(slug, { text: trimmed })
            onApply(draftToFormValues(draft, { base: values, roomCurrency, currencies }))
            setUnmatched(unmatchedNames)
            // The text has done its job. Clearing it means reopening the sheet is
            // a blank one rather than the last sentence, which would otherwise
            // read as "this is still pending".
            setText('')
            setOpen(false)
            feedback('pop', { haptic: 'confirm' })
            // Counts only, and not even that: no text, no amount, no name count.
            // See the note on the event union.
            track('nl_parse_applied', roomProps(slug))
        } catch (err) {
            feedback('error', { haptic: 'error' })
            // The sheet stays open with the sentence still in it — a failed parse
            // must never cost somebody the line they typed.
            setError(errorMessage(err, t('errors.generic')))
            track(
                'nl_parse_failed',
                // A stable failure code, never a message: messages carry the
                // server's English and could one day carry an echo of input.
                roomProps(slug, { reason: isApiError(err) ? err.code : 'unknown' })
            )
        } finally {
            setParsing(false)
        }
    }

    return (
        // `contents`, so the chip becomes a sibling of the scan chip in the
        // drawer's wrapping row while the sheet below still owns a full line.
        // The alternative was hoisting `open` into the drawer to place the two
        // pieces separately, which is state in the wrong component for a layout.
        <div className="contents">
            <button
                type="button"
                onClick={() => {
                    feedback('blip')
                    setOpen((wasOpen) => !wasOpen)
                }}
                aria-expanded={open}
                data-testid="quick-add"
                className={cn(
                    'flex min-h-11 items-center gap-2 self-start rounded-sm border border-dashed border-n-1 px-3 py-2 text-h8 transition-all duration-100',
                    open ? 'shadow-4 bg-primary-1' : 'bg-white active:translate-x-[2px] active:translate-y-[2px]'
                )}
            >
                <Icon name="sparkles" size={18} />
                {t('cta')}
            </button>

            {open && (
                <div className="flex w-full flex-col gap-2 rounded-sm border border-n-1 bg-white p-3">
                    <textarea
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        maxLength={MAX_NL_TEXT_CHARS}
                        rows={2}
                        autoFocus
                        disabled={parsing}
                        placeholder={t('placeholder')}
                        aria-label={t('cta')}
                        data-testid="quick-add-text"
                        className="input min-h-[4.5rem] resize-none px-3 py-2 text-base"
                    />

                    {parsing ? (
                        // The scan's reading animation, at the size this deserves:
                        // one bar, sweeping, gone in a second or two. Still without
                        // it when motion is not allowed — the status line already
                        // carries the whole meaning.
                        <div className="flex items-center gap-2" role="status" aria-live="polite">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-grey-4">
                                <motion.span
                                    className="block h-full w-1/3 rounded-full bg-primary-1"
                                    initial={{ x: '-100%' }}
                                    animate={motionAllowed ? { x: ['-100%', '300%'] } : { x: '0%' }}
                                    transition={
                                        motionAllowed
                                            ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
                                            : { duration: 0 }
                                    }
                                />
                            </span>
                            <span className="text-sm text-grey-1">{t('reading')}</span>
                        </div>
                    ) : (
                        <Button
                            variant="primary"
                            shadowSize="4"
                            onClick={parse}
                            disabled={text.trim().length === 0}
                            className="justify-center"
                            data-testid="quick-add-submit"
                        >
                            {t('action')}
                        </Button>
                    )}

                    {error && (
                        <p role="alert" className="text-sm font-bold text-error">
                            {error}
                        </p>
                    )}
                </div>
            )}

            {unmatched.length > 0 && (
                <p data-testid="quick-add-unmatched" className="w-full text-sm text-grey-1">
                    {t('unmatched', { names: unmatched.join(', ') })}
                </p>
            )}
        </div>
    )
}
