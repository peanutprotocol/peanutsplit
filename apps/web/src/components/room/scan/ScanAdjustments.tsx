'use client'

/**
 * The bill's adjustments — discount, tip, tax, service charge — on the "who had
 * what" screen, where their effect on each person is visible in the totals
 * right below.
 *
 * Each row is three choices, in the order people think about them: what it is,
 * how much (a percentage of the items or a fixed amount), and how it is shared
 * (by what each person had, or equally). The kind picks a sensible default for
 * the last one, so most rows are one tap and one number.
 */

import { useLocale, useTranslations } from 'next-intl'
import { fieldSizes } from '@/components/ui/field'
import { Icon } from '@/components/ui/Icon'
import type { CurrencyInfo } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { currencyInfo, displaySymbol, formatAmountInput, parseAmountToMinor } from '@/lib/money'
import { useFeedback } from '@/lib/use-settings'
import { Money } from '../Money'
import {
    ADJUSTMENT_KINDS,
    adjustmentMinor,
    invalidAdjustments,
    type AdjustmentKind,
    type AdjustmentSpread,
    type ScanAction,
    type ScanState,
} from './scan-state'

type AdjustmentPatch = Extract<ScanAction, { type: 'edit-adjustment' }>['patch']

/** Message key for each kind's name. */
export const KIND_KEY: Record<AdjustmentKind, string> = {
    discount: 'kindDiscount',
    tip: 'kindTip',
    tax: 'kindTax',
    service: 'kindService',
}

interface ScanAdjustmentsProps {
    state: ScanState
    dispatch: (action: ScanAction) => void
    /** The items the adjustments apply to, in minor units — what a percentage is
     *  taken of. */
    baseMinor: string
    decimals: number
    currencies: readonly CurrencyInfo[]
}

export function ScanAdjustments({ state, dispatch, baseMinor, decimals, currencies }: ScanAdjustmentsProps) {
    const t = useTranslations('room.scan')
    const locale = useLocale()
    const feedback = useFeedback()
    const invalid = invalidAdjustments(state, decimals, locale)
    const info = currencyInfo(state.currency, currencies)
    const currencyMark = displaySymbol(info) || info.code

    return (
        <section aria-labelledby="scan-adjustments-title" className="flex flex-col gap-2">
            <h3 id="scan-adjustments-title" className="text-h8 text-grey-1">
                {t('adjustmentsTitle')}
            </h3>

            {state.adjustments.length > 0 && (
                <ul className="flex flex-col gap-2">
                    {state.adjustments.map((adjustment) => {
                        const kindName = t(KIND_KEY[adjustment.kind])
                        const isInvalid = invalid.some((candidate) => candidate.id === adjustment.id)
                        const amount = adjustmentMinor(adjustment, baseMinor, decimals, locale)
                        const edit = (patch: AdjustmentPatch) =>
                            dispatch({ type: 'edit-adjustment', adjustmentId: adjustment.id, patch })
                        return (
                            <li
                                key={adjustment.id}
                                data-testid="scan-adjustment"
                                className="flex flex-col gap-2 rounded-sm border border-n-1 bg-white p-3"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div
                                        role="group"
                                        aria-label={t('adjustmentKindGroup')}
                                        className="flex flex-wrap gap-1.5"
                                    >
                                        {ADJUSTMENT_KINDS.map((kind) => (
                                            <Toggle
                                                key={kind}
                                                on={adjustment.kind === kind}
                                                onClick={() => {
                                                    edit({ kind })
                                                    feedback('tick')
                                                }}
                                            >
                                                {t(KIND_KEY[kind])}
                                            </Toggle>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            dispatch({ type: 'remove-adjustment', adjustmentId: adjustment.id })
                                            feedback('tick')
                                        }}
                                        aria-label={t('removeAdjustmentFor', { kind: kindName })}
                                        data-testid="scan-adjustment-remove"
                                        className="-my-1 flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white"
                                    >
                                        <Icon name="trash" size={16} />
                                    </button>
                                </div>

                                {adjustment.label && <p className="text-sm text-grey-1">{adjustment.label}</p>}

                                <div className="flex items-center gap-2">
                                    <input
                                        value={adjustment.valueInput}
                                        onChange={(event) => edit({ valueInput: event.target.value })}
                                        onBlur={() => {
                                            if (adjustment.unit !== 'amount') return
                                            const minor = parseAmountToMinor(adjustment.valueInput, decimals, locale)
                                            if (minor === null) return
                                            const valueInput = formatAmountInput(minor, decimals, locale)
                                            if (valueInput !== adjustment.valueInput) edit({ valueInput })
                                        }}
                                        inputMode="decimal"
                                        autoComplete="off"
                                        placeholder="0"
                                        aria-label={t('adjustmentValueFor', { kind: kindName })}
                                        aria-invalid={isInvalid || undefined}
                                        data-testid="scan-adjustment-value"
                                        className={cn(
                                            'input w-24 shrink-0 tabular-nums',
                                            fieldSizes.sm,
                                            isInvalid && 'border-error'
                                        )}
                                    />
                                    <div role="group" aria-label={t('adjustmentUnitGroup')} className="flex gap-1.5">
                                        <Toggle
                                            on={adjustment.unit === 'percent'}
                                            onClick={() => edit({ unit: 'percent' })}
                                            testId="scan-adjustment-percent"
                                        >
                                            %
                                        </Toggle>
                                        <Toggle
                                            on={adjustment.unit === 'amount'}
                                            onClick={() => edit({ unit: 'amount' })}
                                            testId="scan-adjustment-amount"
                                        >
                                            {currencyMark}
                                        </Toggle>
                                    </div>
                                    <Money
                                        minor={amount}
                                        currency={state.currency}
                                        catalog={currencies}
                                        className="ml-auto shrink-0 text-h8"
                                    />
                                </div>

                                <div
                                    role="group"
                                    aria-label={t('adjustmentSpreadGroup', { kind: kindName })}
                                    className="flex flex-wrap gap-1.5"
                                >
                                    {(['proportional', 'equal'] as const).map((spread: AdjustmentSpread) => (
                                        <Toggle
                                            key={spread}
                                            on={adjustment.spread === spread}
                                            onClick={() => edit({ spread })}
                                            testId={`scan-adjustment-${spread}`}
                                        >
                                            {t(spread === 'proportional' ? 'spreadProportional' : 'spreadEqual')}
                                        </Toggle>
                                    ))}
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}

            {invalid.length > 0 && (
                <p role="alert" data-testid="scan-adjustment-error" className="text-sm font-bold text-error">
                    {t('adjustmentInvalid')}
                </p>
            )}

            <button
                type="button"
                onClick={() => {
                    dispatch({ type: 'add-adjustment', kind: 'tip' })
                    feedback('tick')
                }}
                data-testid="scan-add-adjustment"
                className="flex min-h-11 items-center gap-2 self-start rounded-sm border border-dashed border-n-1 px-3 py-2 text-h8"
            >
                <Icon name="plus" size={14} />
                {t('addAdjustment')}
            </button>
        </section>
    )
}

function Toggle({
    on,
    onClick,
    children,
    testId,
}: {
    on: boolean
    onClick: () => void
    children: React.ReactNode
    testId?: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={on}
            data-testid={testId}
            className={cn(
                'flex min-h-11 items-center rounded-sm border border-n-1 px-3 py-1 text-sm transition-all duration-100',
                on ? 'bg-primary-1 font-bold' : 'bg-white'
            )}
        >
            {children}
        </button>
    )
}
