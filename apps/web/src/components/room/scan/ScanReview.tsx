'use client'

/**
 * Step 2 of 3 — check what the model read.
 *
 * This screen exists because the model is a reader, not an oracle: it will merge
 * two lines on a creased receipt, or read 8 as 3. Every field is editable, every
 * row is deletable, and a missed row can be added — the user is the authority
 * and the layout should say so, which is why nothing here is presented as a
 * result to accept.
 *
 * The totals block is the honest part. It shows what the items add up to next to
 * what the receipt says it should be, and when they disagree it says so plainly
 * rather than quietly adopting one of the two. A mismatch is information (a
 * missed line, a tip written in by hand), not an error to suppress.
 */

import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import type { CurrencyInfo } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { useFeedback } from '@/lib/use-settings'
import { Money } from '../Money'
import { itemsTotalMinor, totalMismatchMinor, type ScanAction, type ScanState } from './scan-state'

interface ScanReviewProps {
    state: ScanState
    dispatch: (action: ScanAction) => void
    decimals: number
    currencies: readonly CurrencyInfo[]
    onContinue: () => void
    onCancel: () => void
}

export function ScanReview({ state, dispatch, decimals, currencies, onContinue, onCancel }: ScanReviewProps) {
    const t = useTranslations('room.scan')
    const locale = useLocale()
    const feedback = useFeedback()

    const total = itemsTotalMinor(state, decimals)
    const mismatch = totalMismatchMinor(state, decimals)
    const hasMismatch = mismatch !== null && mismatch !== '0'
    const canContinue = BigInt(total) > 0n

    return (
        <div className="flex flex-col gap-5">
            <header className="flex flex-col gap-1">
                <h2 className="text-h5">{t('reviewTitle')}</h2>
                <p className="text-sm text-grey-1">
                    {state.merchant ? t('reviewFromMerchant', { merchant: state.merchant }) : t('reviewBody')}
                </p>
            </header>

            <ul className="flex flex-col gap-2">
                {state.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-2">
                        <input
                            value={item.label}
                            onChange={(event) =>
                                dispatch({ type: 'edit-label', itemId: item.id, label: event.target.value })
                            }
                            placeholder={t('itemPlaceholder')}
                            maxLength={80}
                            aria-label={t('itemLabel')}
                            data-testid="scan-item-label"
                            className="input h-12 min-w-0 flex-1 px-3 text-base"
                        />
                        <input
                            value={item.amountInput}
                            onChange={(event) =>
                                dispatch({ type: 'edit-amount', itemId: item.id, amountInput: event.target.value })
                            }
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder={decimals === 0 ? '0' : '0.00'}
                            aria-label={t('itemAmount')}
                            data-testid="scan-item-amount"
                            className="input h-12 w-24 shrink-0 px-2 text-base tabular-nums"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                dispatch({ type: 'remove-item', itemId: item.id })
                                feedback('tick')
                            }}
                            aria-label={t('removeItem')}
                            data-testid="scan-remove-item"
                            className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white"
                        >
                            <Icon name="trash" size={16} />
                        </button>
                    </li>
                ))}
            </ul>

            {state.items.length === 0 && (
                <p data-testid="scan-no-items" className="text-sm text-grey-1">
                    {t('noItems')}
                </p>
            )}

            <button
                type="button"
                onClick={() => {
                    dispatch({ type: 'add-item' })
                    feedback('tick')
                }}
                data-testid="scan-add-item"
                className="flex min-h-11 items-center gap-2 self-start rounded-sm border border-dashed border-n-1 px-3 py-2 text-h9"
            >
                <Icon name="plus" size={14} />
                {t('addItem')}
            </button>

            <div
                data-testid="scan-totals"
                className={cn(
                    'flex flex-col gap-1 rounded-sm border border-n-1 px-3 py-3 text-h8',
                    hasMismatch ? 'bg-error-1' : 'bg-primary-3'
                )}
            >
                <div className="flex items-center justify-between">
                    <span>{t('itemsTotal')}</span>
                    <Money minor={total} currency={state.currency} catalog={currencies} />
                </div>
                {state.receiptTotalMinor !== null && (
                    <div className="flex items-center justify-between text-grey-1">
                        <span>{t('receiptTotal')}</span>
                        <Money minor={state.receiptTotalMinor} currency={state.currency} catalog={currencies} />
                    </div>
                )}
                {hasMismatch && (
                    <p role="alert" className="pt-1 text-sm font-bold text-error">
                        {t('mismatch', {
                            amount: formatMoney(
                                mismatch.startsWith('-') ? mismatch.slice(1) : mismatch,
                                state.currency,
                                currencies,
                                locale
                            ),
                        })}
                    </p>
                )}
            </div>

            <div className="flex flex-col gap-3">
                <Button
                    variant="primary"
                    shadowSize="4"
                    onClick={onContinue}
                    disabled={!canContinue}
                    className="justify-center text-h6"
                    data-testid="scan-continue"
                >
                    {t('continue')}
                </Button>
                <Button variant="stroke" onClick={onCancel} className="justify-center" data-testid="scan-cancel">
                    {t('cancel')}
                </Button>
            </div>
        </div>
    )
}
