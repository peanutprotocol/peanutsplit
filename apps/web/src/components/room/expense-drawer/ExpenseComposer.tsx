'use client'

import type { RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/cn'
import type { CurrencyInfo, RoomState } from '@/lib/api-types'
import { Doodle } from '@/components/ui/Doodle'
import { Icon } from '@/components/ui/Icon'
import { COMPOSER_CURRENCY_SLOT, composerRowClassName, composerSurfaceClassName } from '@/components/ui/composer-style'
import { CurrencySelect } from '../CurrencySelect'
import { MemberAvatar } from '../MemberAvatar'

export type ExpenseEditor = 'payer' | 'split' | 'date'
type Member = RoomState['members'][number]

interface ExpenseComposerProps {
    amount: {
        inputRef: RefObject<HTMLInputElement | null>
        value: string
        decimals: number
        invalid: boolean
        textSizeClass: string
        onChange: (value: string) => void
        onBlur: () => void
    }
    currency: {
        value: string
        choices: readonly CurrencyInfo[]
        suggested: string[]
        roomCurrency: string
        onChange: (value: string) => void
    }
    description: {
        value: string
        onChange: (value: string) => void
        onBlur: () => void
    }
    editor: ExpenseEditor | null
    onToggleEditor: (editor: ExpenseEditor) => void
    payer: Member | undefined
    payerName: string | undefined
    participants: Member[]
    participantSummary: string
    splitModeSummary: string
    splitModeCaption: string
    dateSummary: string
    repairNotice: string | null
    motionAllowed: boolean
    validationCopy: string | null
    labels: {
        amount: string
        currency: string
        description: string
        descriptionPlaceholder: string
        paidBy: string
        paidBySummary: (name: string) => string
        choosePayer: string
        paid: string
        splitSummary: (people: string, mode: string) => string
        dateSummary: (date: string) => string
        dateShort: string
        amountRequired: string
    }
}

/**
 * The receipt-like summary at the top of the expense workflow.
 *
 * This component owns presentation only. The drawer still owns validation,
 * money parsing, repair rules and every write.
 */
export function ExpenseComposer({
    amount,
    currency,
    description,
    editor,
    onToggleEditor,
    payer,
    payerName,
    participants,
    participantSummary,
    splitModeSummary,
    splitModeCaption,
    dateSummary,
    repairNotice,
    motionAllowed,
    validationCopy,
    labels,
}: ExpenseComposerProps) {
    return (
        <>
            <div
                data-testid="expense-composer"
                className={composerSurfaceClassName(
                    cn('transition-colors', amount.invalid ? 'border-error' : 'border-n-1')
                )}
            >
                <div className="flex min-w-0 items-center gap-2 px-3 py-2">
                    <label className="min-w-0 flex-1">
                        <span className="sr-only">{labels.amount}</span>
                        <input
                            ref={amount.inputRef}
                            value={amount.value}
                            onChange={(event) => amount.onChange(event.target.value)}
                            onBlur={amount.onBlur}
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder={amount.decimals === 0 ? '0' : '0.00'}
                            aria-invalid={amount.invalid || undefined}
                            aria-describedby={amount.invalid ? 'expense-amount-error' : undefined}
                            data-testid="expense-amount"
                            className={cn(
                                'h-16 w-full min-w-0 border-0 bg-transparent px-1 font-extrabold tabular-nums outline-none placeholder:text-grey-2',
                                amount.textSizeClass
                            )}
                        />
                    </label>
                    <div className={COMPOSER_CURRENCY_SLOT}>
                        <CurrencySelect
                            value={currency.value}
                            onChange={currency.onChange}
                            currencies={currency.choices}
                            suggested={currency.suggested}
                            requireRateTo={currency.roomCurrency}
                            variant="sm"
                            aria-label={labels.currency}
                            data-testid="expense-currency"
                        />
                    </div>
                </div>

                <label className={composerRowClassName('block')}>
                    <span className="sr-only">{labels.description}</span>
                    <input
                        value={description.value}
                        onChange={(event) => description.onChange(event.target.value)}
                        onBlur={description.onBlur}
                        placeholder={labels.descriptionPlaceholder}
                        maxLength={255}
                        data-testid="expense-description"
                        className="h-14 w-full border-0 bg-transparent px-4 text-sm font-bold outline-none placeholder:text-grey-1"
                    />
                </label>

                <div className={composerRowClassName('grid grid-cols-[1.1fr_1.45fr_.85fr] p-1.5')}>
                    <button
                        type="button"
                        onClick={() => onToggleEditor('payer')}
                        aria-pressed={editor === 'payer'}
                        aria-label={payerName ? labels.paidBySummary(payerName) : labels.paidBy}
                        data-testid="expense-payer-summary"
                        className={cn(
                            'flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-sm border-r border-dashed border-grey-2 px-1 text-left',
                            editor === 'payer' && 'bg-primary-3'
                        )}
                    >
                        {payer && (
                            <MemberAvatar
                                name={payer.name}
                                avatar={payer.avatar}
                                palette={payer.avatarPalette}
                                size={25}
                            />
                        )}
                        <span className="min-w-0">
                            <span className="block truncate text-h9">{payerName ?? labels.choosePayer}</span>
                            <span className="block text-h10 text-grey-1">{labels.paid}</span>
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onToggleEditor('split')}
                        aria-pressed={editor === 'split'}
                        aria-label={labels.splitSummary(participantSummary, splitModeSummary)}
                        data-testid="expense-split-summary"
                        className={cn(
                            'flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-sm border-r border-dashed border-grey-2 px-1 text-left',
                            editor === 'split' && 'bg-primary-3'
                        )}
                    >
                        <span className="flex shrink-0 pl-1.5">
                            {participants.slice(0, 3).map((member, index) => (
                                <MemberAvatar
                                    key={member.id}
                                    name={member.name}
                                    avatar={member.avatar}
                                    palette={member.avatarPalette}
                                    size={23}
                                    className={index > 0 ? '-ml-2' : ''}
                                />
                            ))}
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate text-h9">{participantSummary}</span>
                            <span className="block truncate text-h10 text-grey-1">{splitModeCaption}</span>
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onToggleEditor('date')}
                        aria-pressed={editor === 'date'}
                        aria-label={labels.dateSummary(dateSummary)}
                        data-testid="expense-date-summary"
                        className={cn(
                            'flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-sm px-1',
                            editor === 'date' && 'bg-primary-3'
                        )}
                    >
                        <Doodle name="iconcalendar" size={19} weight={1.8} className="shrink-0" />
                        <span className="min-w-0">
                            <span className="block truncate text-h9">{dateSummary}</span>
                            <span className="block text-h10 text-grey-1">{labels.dateShort}</span>
                        </span>
                    </button>
                </div>
            </div>

            <AnimatePresence initial={false}>
                {repairNotice && (
                    <motion.p
                        key={repairNotice}
                        role="status"
                        aria-live="polite"
                        initial={motionAllowed ? { opacity: 0, y: -4 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        exit={motionAllowed ? { opacity: 0, y: -4 } : undefined}
                        transition={motionAllowed ? undefined : { duration: 0 }}
                        data-motion-surface
                        className="px-1 text-xs font-bold text-grey-1"
                        data-testid="expense-fields-repaired"
                    >
                        {repairNotice}
                    </motion.p>
                )}
            </AnimatePresence>

            {amount.invalid && (
                <p
                    id="expense-amount-error"
                    role="alert"
                    className="flex items-center gap-2 text-sm font-bold text-error"
                >
                    <Icon name="x" size={16} />
                    {validationCopy ?? labels.amountRequired}
                </p>
            )}
        </>
    )
}
