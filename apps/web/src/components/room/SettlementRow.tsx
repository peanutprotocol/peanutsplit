'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import type { ApiSettlement, CurrencyInfo, RoomState } from '@/lib/api-types'
import { useErrorMessage } from '@/lib/error-messages'
import { useDeleteSettlement } from '@/lib/queries'
import { TOAST_MS } from '@/lib/toasts'
import { useFeedback } from '@/lib/use-settings'
import { MemberAvatar } from './MemberAvatar'
import { Money } from './Money'

interface SettlementRowProps {
    slug: string
    settlement: ApiSettlement
    state: RoomState
    currencies: readonly CurrencyInfo[]
    meId?: string
    token?: string | null
}

/**
 * A payment, in the history where it happened.
 *
 * Styled deliberately quieter than an expense — dashed rather than solid, no
 * shadow, no reaction bar. An expense is money going out of the group; a payment
 * is money moving inside it, and the two reading identically was part of why
 * nobody could find one afterwards.
 *
 * Everything the settlement already carried and nothing rendered — the method,
 * the note, who recorded it — is on the row, because "did somebody put this in
 * twice?" is answered by exactly those three fields.
 *
 * DELETING IS A CONFIRM, NOT AN UNDO, and that is not a taste decision. Expenses
 * get a 6s undo toast because `POST /api/expenses/:id/restore` exists to make it
 * true. There is no such route for settlements: the DELETE soft-deletes for
 * audit, and nothing can bring the row back. Offering an Undo that the next tap
 * would fail is worse than asking first, so the row asks first and says plainly
 * that re-recording is the way back. (A restore route is the obvious other
 * answer; it is a new money-path endpoint, which this repo has frozen, so it is
 * a product decision rather than a TODO.)
 */
export function SettlementRow({ slug, settlement, state, currencies, meId, token }: SettlementRowProps) {
    const t = useTranslations('room.timeline')
    const tSettle = useTranslations('room.settle')
    const tExpenses = useTranslations('room.expenses')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const deleteSettlement = useDeleteSettlement(slug, token)
    const [confirming, setConfirming] = useState(false)

    const nameOf = (id: string) => state.members.find((member) => member.id === id)?.name ?? tExpenses('someone')
    const avatarOf = (id: string) => state.members.find((member) => member.id === id)?.avatar ?? null

    /**
     * Written out one literal at a time rather than `tSettle(settlement.method)`:
     * the column is a free-form string on the wire, so a computed key would both
     * hide these three from `pnpm i18n:audit` and render a raw dotted path for
     * any value a future client invents.
     */
    const methodLabel = (): string | null => {
        switch (settlement.method) {
            case 'cash':
                return tSettle('cash')
            case 'bank':
                return tSettle('bank')
            case 'peanut':
                return tSettle('peanut')
            default:
                return null
        }
    }

    const remove = async () => {
        try {
            await deleteSettlement.mutateAsync(settlement.id)
            feedback('thunk')
            toast(t('removed'), { duration: TOAST_MS.actionable })
        } catch (err) {
            feedback('error', { haptic: 'error' })
            toast.error(errorMessage(err, t('removeFailed')), { duration: TOAST_MS.actionable })
        } finally {
            setConfirming(false)
        }
    }

    const method = methodLabel()
    const recordedBy = settlement.createdById
        ? settlement.createdById === meId
            ? t('recordedByYou')
            : t('recordedBy', { name: nameOf(settlement.createdById) })
        : null
    // "· method · note · recorded by" with whichever of the three exist. Joined
    // rather than conditionally rendered so a missing middle never leaves a
    // dangling separator.
    const details = [method, settlement.note, recordedBy].filter((part): part is string => !!part).join(' · ')

    return (
        <motion.div
            layout
            className="flex flex-col gap-2 rounded-sm border border-dashed border-n-1 bg-background/60 p-3"
            data-testid="settlement-row"
            data-settlement={settlement.id}
        >
            <div className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                    <MemberAvatar name={nameOf(settlement.fromId)} avatar={avatarOf(settlement.fromId)} size={28} />
                    <span className="min-w-0 truncate text-h8">
                        {settlement.fromId === meId ? tExpenses('you') : nameOf(settlement.fromId)}
                    </span>
                    <Icon name="arrow-right" size={14} className="shrink-0 text-grey-1" />
                    <MemberAvatar name={nameOf(settlement.toId)} avatar={avatarOf(settlement.toId)} size={28} />
                    <span className="min-w-0 truncate text-h8">
                        {settlement.toId === meId ? tExpenses('you') : nameOf(settlement.toId)}
                    </span>
                </span>
                <Money
                    minor={settlement.amountMinor}
                    currency={state.room.currency}
                    catalog={currencies}
                    className="shrink-0 text-h7"
                />
                {!confirming && (
                    <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        aria-label={t('remove')}
                        data-testid="remove-settlement"
                        className="shrink-0 p-1 text-grey-1 transition-transform active:translate-y-[1px]"
                    >
                        <Icon name="trash" size={16} />
                    </button>
                )}
            </div>

            <p className="text-h10 uppercase tracking-wide text-grey-1">
                {details ? `${t('paymentLabel')} · ${details}` : t('paymentLabel')}
            </p>

            {confirming && (
                <div className="flex flex-col gap-2 border-t border-dashed border-n-1 pt-2">
                    <p className="text-sm text-n-1">{t('confirmRemove')}</p>
                    <div className="flex gap-2">
                        <Button
                            variant="stroke"
                            className="h-10 flex-1 justify-center"
                            loading={deleteSettlement.isPending}
                            onClick={remove}
                            data-testid="confirm-remove-settlement"
                        >
                            {t('confirmYes')}
                        </Button>
                        <Button
                            variant="transparent"
                            className="h-10 w-auto shrink-0 justify-center px-3 text-sm underline"
                            onClick={() => setConfirming(false)}
                        >
                            {t('confirmNo')}
                        </Button>
                    </div>
                </div>
            )}
        </motion.div>
    )
}
