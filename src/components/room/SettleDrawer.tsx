'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { twMerge } from 'tailwind-merge'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { Icon } from '@/components/ui/Icon'
import { isApiError } from '@/lib/api'
import type { ApiTransfer, CurrencyInfo, RoomState, SettlementMethod } from '@/lib/api-types'
import { roomProps, track } from '@/lib/analytics'
import { useAddSettlement } from '@/lib/queries'
import { AllSettled } from './AllSettled'
import { MemberAvatar } from './MemberAvatar'
import { Money } from './Money'

interface SettleDrawerProps {
    open: boolean
    onClose: () => void
    slug: string
    state: RoomState
    currencies: readonly CurrencyInfo[]
    token?: string | null
}

/** The Peanut link is the ONE place Peanut appears outside the footer mark, and
 *  it sits as an equal among cash and bank transfer — by product guardrail. */
const PEANUT_URL = 'https://peanut.me/send?utm_source=split&utm_medium=settle'

const METHODS: { id: SettlementMethod; label: string; subtitle: string; icon: 'banknote' | 'wallet' | 'sparkles' }[] = [
    { id: 'cash', label: 'Cash', subtitle: 'handed over', icon: 'banknote' },
    { id: 'bank', label: 'Bank', subtitle: 'transfer', icon: 'wallet' },
    { id: 'peanut', label: 'Peanut', subtitle: 'instant, no fees', icon: 'sparkles' },
]

export function SettleDrawer({ open, onClose, slug, state, currencies, token }: SettleDrawerProps) {
    const addSettlement = useAddSettlement(slug, token)
    const [selected, setSelected] = useState<ApiTransfer | null>(null)
    const [method, setMethod] = useState<SettlementMethod>('cash')
    const [note, setNote] = useState('')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        setSelected(null)
        setMethod('cash')
        setNote('')
        setError(null)
        track('settle_sheet_opened', roomProps(slug, { openDebts: state.suggestedTransfers.length }))
        // Only on open — a poll landing mid-confirm must not reset the sheet.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    // The Peanut option was actually rendered — the denominator of THE metric.
    useEffect(() => {
        if (open && selected) track('peanut_option_shown', roomProps(slug))
    }, [open, selected, slug])

    const nameOf = (id: string) => state.members.find((member) => member.id === id)?.name ?? 'Someone'

    const record = async () => {
        if (!selected) return
        setError(null)
        // Opened inside the click handler so Safari does not treat it as a popup.
        if (method === 'peanut') window.open(PEANUT_URL, '_blank', 'noopener,noreferrer')
        try {
            await addSettlement.mutateAsync({
                fromId: selected.fromId,
                toId: selected.toId,
                amountMinor: selected.amountMinor,
                method,
                note: note.trim() ? note.trim() : null,
            })
            track('settlement_recorded', roomProps(slug, { method }))
            toast.success(`${nameOf(selected.fromId)} → ${nameOf(selected.toId)} recorded`)
            onClose()
        } catch (err) {
            setError(isApiError(err) ? err.message : 'could not record that payment — try again')
        }
    }

    const nothingToSettle = state.suggestedTransfers.length === 0

    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent className="bg-background">
                <DrawerHeader className="pb-0">
                    <DrawerTitle className="text-h5">{selected ? 'Record a payment' : 'Who owes whom'}</DrawerTitle>
                </DrawerHeader>

                <div className="flex flex-col gap-4 px-4 pb-10 pt-4">
                    {nothingToSettle && (
                        <div className="-mx-4">
                            {state.expenses.length > 0 ? (
                                <AllSettled compact />
                            ) : (
                                <p className="px-6 py-8 text-center text-sm text-grey-1">
                                    Nothing to settle yet — add an expense first.
                                </p>
                            )}
                        </div>
                    )}

                    {!nothingToSettle && !selected && (
                        <>
                            <p className="text-sm text-grey-1">
                                The fewest payments that clear everything. Pay however you like — we just record it.
                            </p>
                            <ul className="flex flex-col gap-2">
                                {state.suggestedTransfers.map((transfer) => (
                                    <li key={`${transfer.fromId}-${transfer.toId}-${transfer.amountMinor}`}>
                                        <button
                                            type="button"
                                            onClick={() => setSelected(transfer)}
                                            data-testid="transfer-row"
                                            className="shadow-4 flex w-full items-center gap-2 rounded-sm border border-n-1 bg-white p-3 text-left transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                                        >
                                            <MemberAvatar name={nameOf(transfer.fromId)} size={32} />
                                            <span className="min-w-0 flex-1 truncate text-h8">
                                                {nameOf(transfer.fromId)}
                                            </span>
                                            <Icon name="arrow-right" size={16} className="shrink-0 text-grey-1" />
                                            <span className="min-w-0 flex-1 truncate text-h8">
                                                {nameOf(transfer.toId)}
                                            </span>
                                            <MemberAvatar name={nameOf(transfer.toId)} size={32} />
                                            <Money
                                                minor={transfer.amountMinor}
                                                currency={state.room.currency}
                                                catalog={currencies}
                                                className="shrink-0 text-h7"
                                            />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    {selected && (
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col gap-4"
                        >
                            <div className="flex items-center justify-center gap-3 rounded-sm border border-n-1 bg-white p-4">
                                <MemberAvatar name={nameOf(selected.fromId)} size={36} />
                                <span className="text-h8">{nameOf(selected.fromId)}</span>
                                <Icon name="arrow-right" size={18} />
                                <span className="text-h8">{nameOf(selected.toId)}</span>
                                <MemberAvatar name={nameOf(selected.toId)} size={36} />
                            </div>
                            <p className="text-center text-h3 tabular-nums">
                                <Money
                                    minor={selected.amountMinor}
                                    currency={state.room.currency}
                                    catalog={currencies}
                                />
                            </p>

                            <div className="flex flex-col gap-2">
                                <span className="text-h8 uppercase tracking-wide text-grey-1">How was it paid?</span>
                                <div className="grid grid-cols-3 gap-2">
                                    {METHODS.map((option) => {
                                        const active = method === option.id
                                        const isPeanut = option.id === 'peanut'
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => {
                                                    setMethod(option.id)
                                                    if (isPeanut) track('peanut_option_clicked', roomProps(slug))
                                                }}
                                                aria-pressed={active}
                                                data-testid={`method-${option.id}`}
                                                className={twMerge(
                                                    'flex flex-col items-center gap-1 rounded-sm border border-n-1 px-2 py-3 text-center',
                                                    active
                                                        ? isPeanut
                                                            ? 'shadow-4 bg-secondary-1'
                                                            : 'shadow-4 bg-primary-1'
                                                        : 'bg-white'
                                                )}
                                            >
                                                <Icon name={option.icon} size={20} />
                                                <span className="text-h8">{option.label}</span>
                                                <span className="text-h10 leading-tight text-grey-1">
                                                    {option.subtitle}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                                {method === 'peanut' && (
                                    <p className="text-sm text-grey-1">
                                        Opens peanut.me in a new tab to send it — and records the payment here either
                                        way.
                                    </p>
                                )}
                            </div>

                            <label className="flex flex-col gap-2">
                                <span className="text-h8 uppercase tracking-wide text-grey-1">Note (optional)</span>
                                <BaseInput
                                    value={note}
                                    onChange={(event) => setNote(event.target.value)}
                                    placeholder="Sent on Friday"
                                    maxLength={280}
                                    data-testid="settle-note"
                                />
                            </label>

                            {error && (
                                <p role="alert" className="text-sm font-bold text-error">
                                    {error}
                                </p>
                            )}

                            <div className="flex flex-col gap-3">
                                <Button
                                    variant="primary"
                                    shadowSize="4"
                                    onClick={record}
                                    loading={addSettlement.isPending}
                                    className="justify-center text-h6"
                                    data-testid="record-settlement"
                                >
                                    Record payment
                                </Button>
                                <Button variant="stroke" className="justify-center" onClick={() => setSelected(null)}>
                                    Back
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </div>
            </DrawerContent>
        </Drawer>
    )
}
