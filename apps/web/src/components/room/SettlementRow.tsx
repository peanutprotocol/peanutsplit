'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { SlideToConfirm } from '@/components/ui/SlideToConfirm'
import { BTN_MEDIUM } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import { Icon } from '@/components/ui/Icon'
import type { ApiSettlement, CurrencyInfo, RoomState } from '@/lib/api-types'
import { useErrorMessage } from '@/lib/error-messages'
import { useDeleteSettlement } from '@/lib/queries'
import { TOAST_MS } from '@/lib/toasts'
import { useMotionAllowed } from '@/lib/use-motion'
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
    /** A failed refresh leaves this row readable but not safe to mutate. */
    actionsDisabled?: boolean
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
 * Removing is a confirm because it immediately re-opens the room debt. The row
 * itself remains soft-deleted for audit; the UI calls this undoing the record,
 * not undoing any real-world transfer.
 */
export function SettlementRow({
    slug,
    settlement,
    state,
    currencies,
    meId,
    token,
    actionsDisabled = false,
}: SettlementRowProps) {
    const motionAllowed = useMotionAllowed()
    const t = useTranslations('room.timeline')
    const tSettle = useTranslations('room.settle')
    const tExpenses = useTranslations('room.expenses')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const deleteSettlement = useDeleteSettlement(slug, token)
    const [confirming, setConfirming] = useState(false)
    const removeTriggerRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (actionsDisabled) setConfirming(false)
    }, [actionsDisabled])

    const nameOf = (id: string) => state.members.find((member) => member.id === id)?.name ?? tExpenses('someone')
    const avatarOf = (id: string) => state.members.find((member) => member.id === id)?.avatar ?? null
    const paletteOf = (id: string) => state.members.find((member) => member.id === id)?.avatarPalette ?? null

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

    const remove = async (): Promise<boolean> => {
        if (actionsDisabled) return false
        try {
            await deleteSettlement.mutateAsync(settlement.id)
            feedback('thunk')
            toast(t('removed'), { duration: TOAST_MS.actionable })
            return true
        } catch (err) {
            feedback('error', { haptic: 'error' })
            toast.error(errorMessage(err, t('removeFailed')), { duration: TOAST_MS.actionable })
            return false
        }
    }

    const cancelRemove = () => {
        setConfirming(false)
        window.requestAnimationFrame(() => removeTriggerRef.current?.focus())
    }

    const method = methodLabel()
    const recordedBy = settlement.createdById
        ? settlement.createdById === meId
            ? t('recordedByYou')
            : t('recordedBy', { name: nameOf(settlement.createdById) })
        : t('recordedByAnon')
    // "· method · note · recorded by" with whichever of the three exist. Joined
    // rather than conditionally rendered so a missing middle never leaves a
    // dangling separator.
    const details = [method, settlement.note, recordedBy].filter((part): part is string => !!part).join(' · ')

    return (
        <motion.div
            layout={motionAllowed}
            data-motion-surface
            className="flex flex-col gap-2 rounded-sm border border-dashed border-n-1 bg-background/60 p-3"
            data-testid="settlement-row"
            data-settlement={settlement.id}
        >
            <div className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                    <MemberAvatar
                        name={nameOf(settlement.fromId)}
                        avatar={avatarOf(settlement.fromId)}
                        palette={paletteOf(settlement.fromId)}
                        size={28}
                    />
                    <span className="min-w-0 truncate text-h8">
                        {settlement.fromId === meId ? tExpenses('you') : nameOf(settlement.fromId)}
                    </span>
                    <Icon name="arrow-right" size={14} className="shrink-0 text-grey-1" />
                    <MemberAvatar
                        name={nameOf(settlement.toId)}
                        avatar={avatarOf(settlement.toId)}
                        palette={paletteOf(settlement.toId)}
                        size={28}
                    />
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
                        ref={removeTriggerRef}
                        type="button"
                        disabled={actionsDisabled}
                        onClick={() => setConfirming(true)}
                        aria-label={t('remove')}
                        aria-describedby={actionsDisabled ? 'room-stale-warning-copy' : undefined}
                        data-testid="remove-settlement"
                        className="-my-3 -mr-3 flex size-11 shrink-0 items-center justify-center text-grey-1 transition-transform active:translate-y-[1px] disabled:opacity-45 disabled:active:translate-y-0"
                    >
                        <Icon name="trash" size={16} />
                    </button>
                )}
            </div>

            <p className="text-h10 uppercase tracking-wide text-grey-1">
                {details ? `${t('paymentLabel')} · ${details}` : t('paymentLabel')}
            </p>

            {settlement.receiptUrl && (
                <a
                    href={settlement.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-fit text-sm font-bold underline underline-offset-2"
                    data-testid="settlement-receipt-link"
                >
                    {t('receiptLink')}
                </a>
            )}

            {confirming && (
                <div className="flex flex-col gap-2 border-t border-dashed border-n-1 pt-2">
                    <p id={`remove-settlement-warning-${settlement.id}`} className="text-sm text-n-1">
                        {t('confirmRemove')}
                    </p>
                    <div className="flex flex-col gap-2">
                        <SlideToConfirm
                            autoFocus
                            label={t('slideRemove')}
                            loadingLabel={t('removing')}
                            loading={deleteSettlement.isPending}
                            disabled={actionsDisabled}
                            onConfirm={remove}
                            onCancel={cancelRemove}
                            aria-describedby={`remove-settlement-warning-${settlement.id}`}
                            data-testid="confirm-remove-settlement"
                        />
                        <Button
                            variant="stroke"
                            size="medium"
                            className={cn(BTN_MEDIUM, 'justify-center')}
                            onClick={cancelRemove}
                        >
                            {t('confirmNo')}
                        </Button>
                    </div>
                </div>
            )}
        </motion.div>
    )
}
