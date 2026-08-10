'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { BTN_SMALL } from '@/components/ui/control'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody } from '@/components/ui/DrawerLayout'
import { isCatchUpRowChange } from '@/lib/api'
import { roomProps, track } from '@/lib/analytics'
import type { ApiExpense, RoomState } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { expenseLabel } from '@/lib/dates'
import { useErrorMessage } from '@/lib/error-messages'
import {
    catchUpExpenseInput,
    dismissLatecomerReview,
    isLatecomerReviewDismissed,
    latecomerReview,
    projectedBalanceMinor,
    runBackfill,
    selectedImpactMinor,
    suggestedExpenseIds,
    type LatecomerReviewItem,
} from '@/lib/latecomer'
import { formatMoney } from '@/lib/money'
import { isRoomSettled } from '@/lib/pending'
import { useCatchUpExpense } from '@/lib/queries'
import { TOAST_MS } from '@/lib/toasts'
import { useFeedback } from '@/lib/use-settings'
import { MemberAvatar } from './MemberAvatar'

interface LatecomerBannerProps {
    slug: string
    state: RoomState
    memberId: string
    token?: string | null
    onResolved?: () => void
    /** Persist the earned transition above this banner: opening an expense
     * drawer deliberately unmounts it while the review is still unresolved. */
    onFirstSharedBalanceEarned?: () => void
    onOpenChange?: (open: boolean) => void
    onEditExpense?: (expenseId: string) => void
}

const selectable = (item: LatecomerReviewItem): boolean => item.kind !== 'manual'

/**
 * A room fact, not an identity step. Any recorder can review the named person's
 * earlier rows, and nothing is written until the single review sheet is
 * confirmed. The server command still owns the important safety: every row is
 * compared with the reviewed snapshot under the room lock before it changes.
 */
export function LatecomerBanner({
    slug,
    state,
    memberId,
    token,
    onResolved,
    onFirstSharedBalanceEarned,
    onOpenChange,
    onEditExpense,
}: LatecomerBannerProps) {
    const t = useTranslations('room.latecomer')
    const tDates = useTranslations('dates')
    const locale = useLocale()
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const catchUpExpense = useCatchUpExpense(slug, token)
    const review = useMemo(() => latecomerReview(state, memberId), [memberId, state])
    const offeredFor = useRef<string | null>(null)
    const [open, setOpen] = useState(false)
    const [resolved, setResolved] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [submitting, setSubmitting] = useState(false)
    const [conflicted, setConflicted] = useState<Set<string>>(new Set())
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!review || offeredFor.current === review.member.id) return
        offeredFor.current = review.member.id
        track('latecomer_backfill_offered', roomProps(slug, { expenses: review.items.length }))
    }, [review, slug])

    useEffect(() => {
        onOpenChange?.(open)
        return () => {
            if (open) onOpenChange?.(false)
        }
    }, [onOpenChange, open])

    if (!review || resolved || isLatecomerReviewDismissed(slug, review)) return null

    const safeItems = review.items.filter(selectable)
    const selectedIds = [...selected].filter((id) => safeItems.some((item) => item.expense.id === id))
    const selectedSet = new Set(selectedIds)
    const impact = selectedImpactMinor(review, selectedSet)
    const projectedBalance = projectedBalanceMinor(state.balances[memberId] ?? '0', impact)
    const money = (minor: string) => formatMoney(minor, state.room.currency, undefined, locale)
    const dayOptions = { locale, today: tDates('today'), yesterday: tDates('yesterday') }

    const resolveLocally = (excludedIds: ReadonlySet<string> = new Set()) => {
        dismissLatecomerReview(slug, review, excludedIds)
        setResolved(true)
        setOpen(false)
        onResolved?.()
    }

    const openReview = () => {
        setSelected(new Set(suggestedExpenseIds(review)))
        setConflicted(new Set())
        setError(null)
        setOpen(true)
    }

    const editManual = (expenseId: string) => {
        if (submitting) return
        setOpen(false)
        onEditExpense?.(expenseId)
    }

    const apply = async () => {
        if (selectedIds.length === 0) {
            track('latecomer_backfill_accepted', roomProps(slug, { expenses: 0 }))
            resolveLocally()
            return
        }

        const snapshots = selectedIds.flatMap((id) => {
            const item = review.items.find((candidate) => candidate.expense.id === id && selectable(candidate))
            return item ? [item.expense] : []
        })
        if (snapshots.length !== selectedIds.length) {
            setError(t('changedBeforeApply', { count: selectedIds.length - snapshots.length }))
            return
        }

        setSubmitting(true)
        setConflicted(new Set())
        setError(null)
        let wrote = 0
        let skipped = 0
        const applied = new Map<string, ApiExpense>()

        try {
            await runBackfill({
                memberId,
                expenses: snapshots,
                patch: async (expense) => {
                    const result = await catchUpExpense.mutateAsync({
                        expenseId: expense.id,
                        ...catchUpExpenseInput(expense, memberId),
                    })
                    if (
                        state.room.hasReachedSharedBalance !== true &&
                        result.state.room.hasReachedSharedBalance === true
                    ) {
                        onFirstSharedBalanceEarned?.()
                    }
                    const updated = result.state.expenses.find((candidate) => candidate.id === expense.id)
                    if (result.changed && updated) {
                        wrote += 1
                        applied.set(expense.id, updated)
                    }
                    return result
                },
                onWrote: (_done, id) => {
                    setSelected((previous) => {
                        const next = new Set(previous)
                        next.delete(id)
                        return next
                    })
                },
                onSkipped: (id) => {
                    skipped += 1
                    setConflicted((previous) => new Set(previous).add(id))
                    setSelected((previous) => {
                        const next = new Set(previous)
                        next.delete(id)
                        return next
                    })
                },
                onPatchError: (patchError) => (isCatchUpRowChange(patchError) ? 'skip' : 'throw'),
                stopped: () => false,
            })

            track('latecomer_backfill_accepted', roomProps(slug, { expenses: wrote }))
            if (skipped > 0) {
                feedback('error', { haptic: 'error' })
                setError(t('changedBeforeApply', { count: skipped }))
                return
            }

            feedback('pop')
            resolveLocally(new Set(selectedIds))
            toast(t('updated', { name: review.member.name, count: wrote }), {
                duration: TOAST_MS.actionable,
                ...(applied.size > 0
                    ? {
                          action: {
                              label: t('undo'),
                              onClick: () => {
                                  const toastId = toast.loading(t('undoing'))
                                  void (async () => {
                                      try {
                                          for (const expense of [...applied.values()].reverse()) {
                                              await catchUpExpense.mutateAsync({
                                                  expenseId: expense.id,
                                                  ...catchUpExpenseInput(expense, memberId, 'remove'),
                                              })
                                          }
                                          toast.success(t('undone'), { id: toastId, duration: TOAST_MS.state })
                                      } catch {
                                          toast.error(t('undoFailed'), {
                                              id: toastId,
                                              duration: TOAST_MS.actionable,
                                          })
                                      }
                                  })()
                              },
                          },
                      }
                    : {}),
            })
        } catch (err) {
            feedback('error', { haptic: 'error' })
            track('latecomer_backfill_accepted', roomProps(slug, { expenses: wrote }))
            setError(errorMessage(err, t('failed', { done: wrote })))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <>
            <section data-testid="latecomer-banner" className="mx-4 rounded-sm border border-n-1 bg-primary-3 p-4">
                <div className="flex items-start gap-3" data-testid="latecomer-copy-row">
                    <MemberAvatar
                        name={review.member.name}
                        avatar={review.member.avatar}
                        palette={review.member.avatarPalette}
                        size={36}
                    />
                    <div className="min-w-0 flex-1" data-testid="latecomer-copy">
                        <p className="break-words text-h8 [overflow-wrap:anywhere]">
                            {t('promptTitle', { name: review.member.name })}
                        </p>
                        <p className="mt-1 break-words text-sm leading-5 text-grey-1 [overflow-wrap:anywhere]">
                            {t('promptBody', { name: review.member.name, count: review.items.length })}
                        </p>
                    </div>
                </div>
                <div
                    className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                    data-testid="latecomer-actions"
                >
                    <Button
                        variant="primary"
                        size="small"
                        className={cn(BTN_SMALL, 'justify-center')}
                        onClick={openReview}
                        data-testid="latecomer-review"
                    >
                        {t('review')}
                    </Button>
                    <Button
                        variant="transparent"
                        size="small"
                        width="auto"
                        className={cn(BTN_SMALL, 'justify-center underline')}
                        onClick={() => resolveLocally()}
                        data-testid="latecomer-dismiss"
                    >
                        {t('notNow')}
                    </Button>
                </div>
            </section>

            <Drawer
                open={open}
                dismissible={!submitting}
                onOpenChange={(next) => {
                    if (!next && !submitting) setOpen(false)
                }}
            >
                <DrawerContent data-testid="latecomer-flow">
                    <DrawerBody className="min-w-0 gap-4 pt-2">
                        <div className="flex items-center gap-3">
                            <MemberAvatar
                                name={review.member.name}
                                avatar={review.member.avatar}
                                palette={review.member.avatarPalette}
                                size={40}
                            />
                            <div className="min-w-0">
                                <DrawerTitle className="break-words text-h5 [overflow-wrap:anywhere]">
                                    {t('sheetTitle', { name: review.member.name })}
                                </DrawerTitle>
                                <p className="mt-1 break-words text-sm leading-5 text-grey-1 [overflow-wrap:anywhere]">
                                    {t('reviewBody', { name: review.member.name })}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col divide-y divide-n-1 rounded-sm border border-n-1 bg-white">
                            {review.items.map((item) => (
                                <ExpenseReviewRow
                                    key={item.expense.id}
                                    item={item}
                                    memberName={review.member.name}
                                    selected={selectedSet.has(item.expense.id)}
                                    conflicted={conflicted.has(item.expense.id)}
                                    disabled={submitting}
                                    room={state}
                                    locale={locale}
                                    dayOptions={dayOptions}
                                    onToggle={() =>
                                        setSelected((previous) => {
                                            const next = new Set(previous)
                                            if (next.has(item.expense.id)) next.delete(item.expense.id)
                                            else next.add(item.expense.id)
                                            return next
                                        })
                                    }
                                    onEdit={() => editManual(item.expense.id)}
                                />
                            ))}
                        </div>

                        <ImpactSummary
                            count={selectedIds.length}
                            memberName={review.member.name}
                            balance={projectedBalance}
                            money={money}
                        />

                        {isRoomSettled(state) && selectedIds.length > 0 && (
                            <p className="rounded-sm border border-n-1 bg-primary-1 p-3 text-sm">
                                <strong>{t('settledWarningTitle')}</strong> {t('settledWarningBody')}
                            </p>
                        )}

                        {error && (
                            <p
                                role="alert"
                                className="rounded-sm border border-error bg-white p-3 text-sm font-bold text-error"
                            >
                                {error}
                            </p>
                        )}

                        <DrawerActions className="sticky bottom-0 -mx-1 border-t border-n-1 bg-background px-1 pt-3">
                            <Button
                                variant="primary"
                                shadowSize="4"
                                className="h-auto min-h-13 justify-center py-3 text-center text-h6"
                                onClick={() => void apply()}
                                loading={submitting}
                                data-testid="latecomer-confirm"
                            >
                                {submitting
                                    ? t('updating')
                                    : selectedIds.length > 0
                                      ? t('confirmSelection', { count: selectedIds.length })
                                      : t('leaveUnchanged')}
                            </Button>
                            <Button
                                variant="transparent"
                                className="justify-center underline"
                                onClick={() => resolveLocally()}
                                disabled={submitting}
                                data-testid="latecomer-not-now"
                            >
                                {t('notNow')}
                            </Button>
                        </DrawerActions>
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </>
    )
}

function ExpenseReviewRow({
    item,
    memberName,
    selected,
    conflicted,
    disabled,
    room,
    locale,
    dayOptions,
    onToggle,
    onEdit,
}: {
    item: LatecomerReviewItem
    memberName: string
    selected: boolean
    conflicted: boolean
    disabled: boolean
    room: RoomState
    locale: string
    dayOptions: { locale: string; today: string; yesterday: string }
    onToggle: () => void
    onEdit: () => void
}) {
    const t = useTranslations('room.latecomer')
    const expense = item.expense
    const label = expenseLabel(expense.description, expense.date, dayOptions)

    if (item.kind === 'manual') {
        return (
            <button
                type="button"
                className="flex min-h-14 w-full items-center gap-3 p-3 text-left disabled:opacity-60"
                onClick={onEdit}
                disabled={disabled}
            >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-grey-3">
                    —
                </span>
                <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{label}</strong>
                    <span className="block text-xs text-grey-1">{t('manualSplit', { mode: expense.splitMode })}</span>
                </span>
                <span className="text-sm font-bold underline">{t('edit')}</span>
            </button>
        )
    }

    return (
        <button
            type="button"
            aria-pressed={selected}
            className={cn(
                'flex min-h-14 w-full items-center gap-3 p-3 text-left disabled:opacity-60',
                selected && 'bg-primary-3',
                conflicted && 'bg-primary-1'
            )}
            onClick={onToggle}
            disabled={disabled}
        >
            <span
                aria-hidden="true"
                className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-sm border border-n-1 font-bold',
                    selected ? 'bg-primary-1' : 'bg-white'
                )}
            >
                {selected ? '✓' : ''}
            </span>
            <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm">{label}</strong>
                <span className="block text-xs text-grey-1">
                    {conflicted
                        ? t('rowChanged')
                        : item.kind === 'suggested'
                          ? t('wholeGroup', { from: expense.shares.length, to: expense.shares.length + 1 })
                          : t('subset', { count: expense.shares.length, name: memberName })}
                </span>
            </span>
            <span className="min-w-0 max-w-24 break-words text-right text-xs font-bold [overflow-wrap:anywhere]">
                {t('memberShare', {
                    name: memberName,
                    amount: formatMoney(item.impactMinor!, room.room.currency, undefined, locale),
                })}
            </span>
        </button>
    )
}

function ImpactSummary({
    count,
    memberName,
    balance,
    money,
}: {
    count: number
    memberName: string
    balance: string
    money: (minor: string) => string
}) {
    const t = useTranslations('room.latecomer')
    const value = BigInt(balance)
    let outcome = t('noChange')
    if (count > 0 && value < 0n) outcome = t('projectedOwe', { name: memberName, amount: money((-value).toString()) })
    else if (count > 0 && value > 0n)
        outcome = t('projectedBack', { name: memberName, amount: money(value.toString()) })
    else if (count > 0) outcome = t('projectedSettled', { name: memberName })

    return (
        <div
            role="status"
            aria-live="polite"
            className="flex min-w-0 items-center justify-between gap-4 rounded-sm border border-n-1 bg-white p-3 text-sm"
        >
            <span className="shrink-0">{t('selectedCount', { count })}</span>
            <strong className="min-w-0 flex-1 break-words text-right [overflow-wrap:anywhere]">{outcome}</strong>
        </div>
    )
}
