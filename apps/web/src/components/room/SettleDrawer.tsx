'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { Icon } from '@/components/ui/Icon'
import type { ApiTransfer, CurrencyInfo, RoomState, SettlementMethod } from '@/lib/api-types'
import { roomProps, track } from '@/lib/analytics'
import { cn } from '@/lib/cn'
import { useErrorMessage } from '@/lib/error-messages'
import { useAddSettlement } from '@/lib/queries'
import { useFeedback } from '@/lib/use-settings'
import { AllSettled } from './AllSettled'
import { MemberAvatar } from './MemberAvatar'
import { AnimatedMoney, Money } from './Money'

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

/**
 * Built inside the component so the labels can be translated, but each key is still written out
 * literally — a `t(\`settle.${id}\`)` loop would save two lines and cost the audit script its
 * ability to prove all six strings exist in all three catalogs.
 */
const methodOptions = (t: (key: string) => string) =>
    [
        { id: 'cash', label: t('cash'), subtitle: t('cashHint'), icon: 'banknote' },
        { id: 'bank', label: t('bank'), subtitle: t('bankHint'), icon: 'wallet' },
        { id: 'peanut', label: t('peanut'), subtitle: t('peanutHint'), icon: 'sparkles' },
    ] satisfies { id: SettlementMethod; label: string; subtitle: string; icon: 'banknote' | 'wallet' | 'sparkles' }[]

/** Stable identity for a suggested transfer — it has no id of its own. */
const transferKey = (transfer: ApiTransfer) => `${transfer.fromId}-${transfer.toId}-${transfer.amountMinor}`

/** Beat one — the row reads as settled before it goes anywhere. */
const STAMP_MS = 280
/** Beat two — the collapse itself, plus a moment to watch the gap close. */
const COLLAPSE_MS = 620

export function SettleDrawer({ open, onClose, slug, state, currencies, token }: SettleDrawerProps) {
    const t = useTranslations('room.settle')
    const tExpenses = useTranslations('room.expenses')
    const errorMessage = useErrorMessage()
    const addSettlement = useAddSettlement(slug, token)
    const feedback = useFeedback()
    const reduceMotion = useReducedMotion()
    const [selected, setSelected] = useState<ApiTransfer | null>(null)
    const [method, setMethod] = useState<SettlementMethod>('cash')
    const [note, setNote] = useState('')
    const [error, setError] = useState<string | null>(null)

    /**
     * Signature moment #5 lives in these two pieces of state.
     *
     * The server drops a settled transfer out of `suggestedTransfers` the instant
     * the mutation resolves, so there is nothing left to animate *out*. So we
     * freeze the list we were showing, mark one row as settling, let it play its
     * stamp-then-collapse while its siblings spring up into the gap, and only
     * then hand the list back to the server.
     */
    const [frozen, setFrozen] = useState<ApiTransfer[] | null>(null)
    const [settledKey, setSettledKey] = useState<string | null>(null)
    const [collapsing, setCollapsing] = useState(false)
    const timers = useRef<number[]>([])

    const clearTimers = useCallback(() => {
        timers.current.forEach((id) => window.clearTimeout(id))
        timers.current = []
    }, [])

    useEffect(() => clearTimers, [clearTimers])

    useEffect(() => {
        if (!open) return
        setSelected(null)
        setMethod('cash')
        setNote('')
        setError(null)
        setFrozen(null)
        setSettledKey(null)
        setCollapsing(false)
        clearTimers()
        track('settle_sheet_opened', roomProps(slug, { openDebts: state.suggestedTransfers.length }))
        // Only on open — a poll landing mid-confirm must not reset the sheet.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    // The Peanut option was actually rendered — the denominator of THE metric.
    useEffect(() => {
        if (open && selected) track('peanut_option_shown', roomProps(slug))
    }, [open, selected, slug])

    const nameOf = (id: string) => state.members.find((member) => member.id === id)?.name ?? tExpenses('someone')

    const record = async () => {
        if (!selected) return
        setError(null)
        const key = transferKey(selected)
        // Hold the list we are looking at *before* the mutation lands, so the row
        // is still mounted when we ask it to leave.
        setFrozen(state.suggestedTransfers)
        // Opened inside the click handler so Safari does not treat it as a popup.
        if (method === 'peanut') window.open(PEANUT_URL, '_blank', 'noopener,noreferrer')
        try {
            const next = await addSettlement.mutateAsync({
                fromId: selected.fromId,
                toId: selected.toId,
                amountMinor: selected.amountMinor,
                method,
                note: note.trim() ? note.trim() : null,
            })
            track('settlement_recorded', roomProps(slug, { method }))

            // Wood on wood, the moment the money moves.
            feedback('thunk')
            setSelected(null)
            setSettledKey(key)

            const done = () => {
                clearTimers()
                setFrozen(null)
                setSettledKey(null)
                setCollapsing(false)
                onClose()
            }

            if (reduceMotion) {
                // No collapse played, so there is nothing to have watched — say it
                // in words instead. Everyone else already saw the row go.
                toast.success(t('recorded', { from: nameOf(selected.fromId), to: nameOf(selected.toId) }))
                done()
                return
            }
            // Beat one: the row lands settled — green, stamped, no longer a debt.
            // Beat two: it collapses out and its siblings close the gap.
            timers.current.push(window.setTimeout(() => setCollapsing(true), STAMP_MS))
            timers.current.push(window.setTimeout(done, STAMP_MS + COLLAPSE_MS))
        } catch (err) {
            setFrozen(null)
            setSettledKey(null)
            setCollapsing(false)
            setError(errorMessage(err, t('failed')))
        }
    }

    // While a row is being settled we render the frozen snapshot; dropping the
    // row on beat two is what gives AnimatePresence something to animate out.
    const source = frozen ?? state.suggestedTransfers
    const transfers = collapsing && settledKey ? source.filter((t) => transferKey(t) !== settledKey) : source

    // Always the server's list, never the frozen one — this is the number that
    // has to move the instant the settlement is real.
    const outstandingMinor = state.suggestedTransfers
        .reduce((total, transfer) => total + BigInt(transfer.amountMinor), 0n)
        .toString()

    const nothingToSettle = transfers.length === 0 && !settledKey

    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent className="bg-background">
                <DrawerHeader className="pb-0">
                    <DrawerTitle className="text-h5">{selected ? t('recordTitle') : t('listTitle')}</DrawerTitle>
                </DrawerHeader>

                <div className="flex flex-col gap-4 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4">
                    {nothingToSettle && (
                        <div className="-mx-4">
                            {state.expenses.length > 0 ? (
                                <AllSettled compact />
                            ) : (
                                <p className="px-6 py-8 text-center text-sm text-grey-1">{t('nothingToSettle')}</p>
                            )}
                        </div>
                    )}

                    {!nothingToSettle && !selected && (
                        <>
                            <p className="text-sm text-grey-1">{t('intro')}</p>

                            <ul className="flex flex-col gap-2">
                                <AnimatePresence initial={false} mode="popLayout">
                                    {transfers.map((transfer) => {
                                        const key = transferKey(transfer)
                                        const settled = key === settledKey
                                        return (
                                            <motion.li
                                                key={key}
                                                layout
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={
                                                    settled
                                                        ? // The stamp: a short overshoot as the debt lands.
                                                          { opacity: 1, y: 0, scale: [1, 1.035, 1] }
                                                        : { opacity: 1, y: 0, scale: 1 }
                                                }
                                                exit={{
                                                    opacity: 0,
                                                    scale: 0.82,
                                                    // Down and to the right, into the shadow it was casting —
                                                    // the row falls out of the stack rather than fading.
                                                    y: 14,
                                                    x: 10,
                                                    transition: { duration: 0.26, ease: [0.4, 0, 1, 1] },
                                                }}
                                                transition={{
                                                    layout: { type: 'spring', stiffness: 420, damping: 32, mass: 0.7 },
                                                    scale: { duration: 0.28, ease: 'easeOut' },
                                                    default: { type: 'spring', stiffness: 380, damping: 30 },
                                                }}
                                                // The row on its way out passes over the ones
                                                // rising to fill the gap, not under them.
                                                style={{ zIndex: settled ? 2 : 1 }}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => !settledKey && setSelected(transfer)}
                                                    disabled={settled}
                                                    data-testid="transfer-row"
                                                    data-settled={settled ? 'true' : undefined}
                                                    className={cn(
                                                        'shadow-4 flex w-full items-center gap-2 rounded-sm border border-n-1 p-3 text-left transition-colors duration-200',
                                                        settled
                                                            ? 'bg-green-1'
                                                            : 'bg-white active:translate-x-[3px] active:translate-y-[3px] active:shadow-none'
                                                    )}
                                                >
                                                    <span className="flex min-w-0 flex-1 items-center gap-2">
                                                        <MemberAvatar name={nameOf(transfer.fromId)} size={32} />
                                                        <span className="min-w-0 truncate text-h8">
                                                            {nameOf(transfer.fromId)}
                                                        </span>
                                                    </span>
                                                    <Icon
                                                        name={settled ? 'check' : 'arrow-right'}
                                                        size={16}
                                                        className={cn('shrink-0', settled ? 'text-n-1' : 'text-grey-1')}
                                                    />
                                                    <span className="flex min-w-0 flex-1 items-center gap-2">
                                                        <MemberAvatar name={nameOf(transfer.toId)} size={32} />
                                                        <span className="min-w-0 truncate text-h8">
                                                            {nameOf(transfer.toId)}
                                                        </span>
                                                    </span>
                                                    <Money
                                                        minor={transfer.amountMinor}
                                                        currency={state.room.currency}
                                                        catalog={currencies}
                                                        className="shrink-0 text-h7"
                                                    />
                                                </button>
                                            </motion.li>
                                        )
                                    })}
                                </AnimatePresence>
                            </ul>

                            {/* The other half of moment #5: as the row collapses, the
                                outstanding total counts down to its new value. */}
                            <motion.div
                                layout
                                className="flex items-center justify-between rounded-sm border border-dashed border-n-1 px-3 py-3"
                            >
                                <span className="text-h8 uppercase tracking-wide text-grey-1">
                                    {t('stillOutstanding')}
                                </span>
                                <AnimatedMoney
                                    minor={outstandingMinor}
                                    currency={state.room.currency}
                                    catalog={currencies}
                                    className="text-h6"
                                />
                            </motion.div>
                        </>
                    )}

                    {selected && (
                        <motion.div
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                            className="flex flex-col gap-4"
                        >
                            <div className="shadow-4 flex items-center justify-center gap-3 rounded-sm border border-n-1 bg-white p-4">
                                <span className="flex min-w-0 items-center gap-2">
                                    <MemberAvatar name={nameOf(selected.fromId)} size={36} />
                                    <span className="truncate text-h8">{nameOf(selected.fromId)}</span>
                                </span>
                                <Icon name="arrow-right" size={18} className="shrink-0" />
                                <span className="flex min-w-0 items-center gap-2">
                                    <MemberAvatar name={nameOf(selected.toId)} size={36} />
                                    <span className="truncate text-h8">{nameOf(selected.toId)}</span>
                                </span>
                            </div>
                            <motion.p
                                initial={{ scale: 0.86, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 320, damping: 17, delay: 0.06 }}
                                className="text-center text-h2 tabular-nums"
                            >
                                <Money
                                    minor={selected.amountMinor}
                                    currency={state.room.currency}
                                    catalog={currencies}
                                />
                            </motion.p>

                            <div className="flex flex-col gap-2">
                                <span className="text-h8 uppercase tracking-wide text-grey-1">{t('howPaid')}</span>
                                <div className="grid grid-cols-3 gap-2">
                                    {methodOptions(t).map((option) => {
                                        const active = method === option.id
                                        const isPeanut = option.id === 'peanut'
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => {
                                                    setMethod(option.id)
                                                    feedback('tick')
                                                    if (isPeanut) track('peanut_option_clicked', roomProps(slug))
                                                }}
                                                aria-pressed={active}
                                                data-testid={`method-${option.id}`}
                                                className={cn(
                                                    'flex min-h-[3.25rem] flex-col items-center gap-1 rounded-sm border border-n-1 px-2 py-3 text-center transition-transform active:translate-y-[2px]',
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
                                {method === 'peanut' && <p className="text-sm text-grey-1">{t('peanutNote')}</p>}
                            </div>

                            <label className="flex flex-col gap-2">
                                <span className="text-h8 uppercase tracking-wide text-grey-1">{t('note')}</span>
                                <BaseInput
                                    value={note}
                                    onChange={(event) => setNote(event.target.value)}
                                    placeholder={t('notePlaceholder')}
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
                                    {t('record')}
                                </Button>
                                <Button variant="stroke" className="justify-center" onClick={() => setSelected(null)}>
                                    {t('back')}
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </div>
            </DrawerContent>
        </Drawer>
    )
}
