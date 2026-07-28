'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { Icon } from '@/components/ui/Icon'
import type { ApiTransfer, CurrencyInfo, RoomState, SettlementMethod } from '@/lib/api-types'
import { roomProps, track } from '@/lib/analytics'
import { cn } from '@/lib/cn'
import { useErrorMessage } from '@/lib/error-messages'
import { decimalsOf, formatMinorPlain, parseAmountToMinor } from '@/lib/money'
import { useAddSettlement } from '@/lib/queries'
import { TOAST_MS } from '@/lib/toasts'
import { useMotionAllowed } from '@/lib/use-motion'
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

/**
 * Rows arrive one after another, not as a block: a list that appears all at once
 * is a page, a list that arrives in sequence is something being dealt out to you,
 * and this one is a list of debts you are about to act on.
 *
 * Capped, because the stagger is a reveal and not a queue — a room with fifteen
 * open transfers should not make you wait a second for the last one.
 */
const REVEAL_STAGGER_S = 0.07
const REVEAL_STAGGER_MAX = 6

export function SettleDrawer({ open, onClose, slug, state, currencies, token }: SettleDrawerProps) {
    const t = useTranslations('room.settle')
    const tExpenses = useTranslations('room.expenses')
    const errorMessage = useErrorMessage()
    const addSettlement = useAddSettlement(slug, token)
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()
    const [selected, setSelected] = useState<ApiTransfer | null>(null)
    const [method, setMethod] = useState<SettlementMethod>('cash')
    const [note, setNote] = useState('')
    const [error, setError] = useState<string | null>(null)
    /**
     * The amount, as typed. Pre-filled with the suggestion, because the suggestion
     * is right most of the time — but editable, because part-paying a debt is
     * ordinary life ("I'll give you the fifty now and the rest on Friday") and the
     * server has always accepted any positive amount. A sheet that could only
     * record the whole thing forced people to either lie about what moved or
     * record nothing, and recording nothing is how a room stops being believed.
     */
    const [amount, setAmount] = useState('')
    /**
     * Settlements recorded from this sheet since the page loaded, by id.
     *
     * Deliberately NOT cleared when the sheet reopens — that is the entire point.
     * A recorded payment leaves `suggestedTransfers` immediately, so the sheet
     * that had a row in it a second ago has nothing, which reads exactly like the
     * payment having failed to save. Keeping the ids means the sheet can show the
     * row again from server truth, so a deleted one correctly disappears and a
     * partial one correctly shows the amount that actually moved.
     */
    const [recordedIds, setRecordedIds] = useState<string[]>([])

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
        setAmount('')
        setError(null)
        setFrozen(null)
        setSettledKey(null)
        setCollapsing(false)
        clearTimers()
        feedback('blip')
        track('settle_sheet_opened', roomProps(slug, { openDebts: state.suggestedTransfers.length }))
        // Only on open — a poll landing mid-confirm must not reset the sheet.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    // The Peanut option was actually rendered — the denominator of THE metric.
    useEffect(() => {
        if (open && selected) track('peanut_option_shown', roomProps(slug))
    }, [open, selected, slug])

    const nameOf = (id: string) => state.members.find((member) => member.id === id)?.name ?? tExpenses('someone')
    const avatarOf = (id: string) => state.members.find((member) => member.id === id)?.avatar ?? null

    const decimals = decimalsOf(state.room.currency, currencies)

    /** Picking a row seeds the field with what the room says is owed — the whole
     *  suggestion, in the room's own decimal places. */
    const pick = (transfer: ApiTransfer) => {
        setSelected(transfer)
        setAmount(formatMinorPlain(transfer.amountMinor, decimals))
        setError(null)
    }

    /**
     * The typed amount as minor units, or a reason it is not one. Bounded by the
     * suggestion at the top: paying MORE than the debt is not a partial payment,
     * it is a different transaction the room has no way to represent, and it
     * would leave the payee owing the payer with no row explaining why.
     *
     * A UI ceiling, not a server invariant — worth being plain about, because the
     * sentence above sounds like one. `POST /settlements` accepts any positive
     * amount between two members, and the room link is the only credential there
     * is, so anybody who can open this sheet can post past the ceiling with a
     * fetch. Left that way on purpose: enforcing it would mean deriving the gross
     * debt inside the route, and the thing being prevented is a typo among people
     * who already trust each other with the link, not an attacker.
     */
    const enteredMinor = (): { minor: string } | { problem: string } => {
        if (!selected) return { problem: t('amountInvalid') }
        const parsed = parseAmountToMinor(amount, decimals)
        if (parsed === null || BigInt(parsed) <= 0n) return { problem: t('amountInvalid') }
        if (BigInt(parsed) > BigInt(selected.amountMinor))
            return { problem: t('amountTooHigh', { name: nameOf(selected.fromId) }) }
        return { minor: parsed }
    }

    const record = async () => {
        if (!selected) return
        setError(null)
        const entered = enteredMinor()
        if ('problem' in entered) {
            feedback('error', { haptic: 'error' })
            setError(entered.problem)
            return
        }
        const partial = entered.minor !== selected.amountMinor
        const key = transferKey(selected)
        // Hold the list we are looking at *before* the mutation lands, so the row
        // is still mounted when we ask it to leave.
        setFrozen(state.suggestedTransfers)
        // Opened inside the click handler so Safari does not treat it as a popup.
        if (method === 'peanut') window.open(PEANUT_URL, '_blank', 'noopener,noreferrer')
        // The ids the room already held, so the one that comes back can be told
        // apart from them — the POST answers with the whole room, not the row.
        const before = new Set(state.settlements.map((settlement) => settlement.id))
        try {
            const next = await addSettlement.mutateAsync({
                fromId: selected.fromId,
                toId: selected.toId,
                amountMinor: entered.minor,
                method,
                note: note.trim() ? note.trim() : null,
            })
            const created = next.settlements.find((settlement) => !before.has(settlement.id))
            if (created) setRecordedIds((previous) => [...previous, created.id])
            // `partial` is a boolean about a payment, not an amount — the same
            // line the rest of this file holds: what happened, never how much.
            track('settlement_recorded', roomProps(slug, { method, partial }))

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

            if (!motionAllowed) {
                // No collapse played, so there is nothing to have watched — say it
                // in words instead. Everyone else already saw the row go.
                toast.success(t('recorded', { from: nameOf(selected.fromId), to: nameOf(selected.toId) }), {
                    // A debt disappeared and they did not see it move: this is the
                    // only account of it, so it gets the longer state duration.
                    duration: TOAST_MS.state,
                })
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
            // Money did not move. That deserves the dull thud and the three-pulse
            // "no", not a red line of text on its own.
            feedback('error', { haptic: 'error' })
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

    // Read back off the room rather than remembered as typed: a payment somebody
    // deleted from the history in the meantime must not still be listed here as
    // recorded, and a partial one has to show the amount that actually moved.
    const recorded = state.settlements.filter((settlement) => recordedIds.includes(settlement.id))

    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent className={drawerContentClass}>
                <DrawerHeader className={drawerHeaderClass}>
                    <DrawerTitle className="text-h5">{selected ? t('recordTitle') : t('listTitle')}</DrawerTitle>
                </DrawerHeader>

                <DrawerBody>
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
                                {/* `initial` left on (the default) so the list deals itself
                                    out on open. The sheet unmounts when it closes, so this
                                    is a genuine reveal every time rather than a re-entrance. */}
                                <AnimatePresence mode="popLayout">
                                    {transfers.map((transfer, index) => {
                                        const key = transferKey(transfer)
                                        const settled = key === settledKey
                                        // Delay lives on the animate target rather than in
                                        // `transition`, which motion would also apply to the
                                        // stamp and the collapse — a settle that hesitates
                                        // for half a second reads as a failed tap.
                                        const revealDelay = Math.min(index, REVEAL_STAGGER_MAX) * REVEAL_STAGGER_S
                                        return (
                                            <motion.li
                                                key={key}
                                                layout
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={
                                                    settled
                                                        ? // The stamp: a short overshoot as the debt lands.
                                                          { opacity: 1, y: 0, scale: [1, 1.035, 1] }
                                                        : {
                                                              opacity: 1,
                                                              y: 0,
                                                              scale: 1,
                                                              transition: {
                                                                  type: 'spring',
                                                                  stiffness: 380,
                                                                  damping: 30,
                                                                  delay: revealDelay,
                                                              },
                                                          }
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
                                                    onClick={() => !settledKey && pick(transfer)}
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
                                                        <MemberAvatar
                                                            name={nameOf(transfer.fromId)}
                                                            avatar={avatarOf(transfer.fromId)}
                                                            size={32}
                                                        />
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
                                                        <MemberAvatar
                                                            name={nameOf(transfer.toId)}
                                                            avatar={avatarOf(transfer.toId)}
                                                            size={32}
                                                        />
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
                                className="flex items-center justify-between rounded-sm border border-dashed border-n-1 p-3"
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

                    {/* Shown whether or not anything is left outstanding — the
                        case this exists for is the LAST payment, where the sheet
                        would otherwise go from one row to an empty celebration
                        with no trace of what just got recorded. */}
                    {!selected && recorded.length > 0 && (
                        <div className="flex flex-col gap-2" data-testid="recorded-settlements">
                            <span className="text-h8 uppercase tracking-wide text-grey-1">{t('recordedTitle')}</span>
                            <ul className="flex flex-col gap-2">
                                {recorded.map((settlement) => (
                                    <li
                                        key={settlement.id}
                                        data-testid="recorded-settlement"
                                        className="flex items-center gap-2 rounded-sm border border-dashed border-n-1 p-3"
                                    >
                                        <Icon name="check" size={16} className="shrink-0 text-grey-1" />
                                        <span className="flex min-w-0 flex-1 items-center gap-2">
                                            <MemberAvatar
                                                name={nameOf(settlement.fromId)}
                                                avatar={avatarOf(settlement.fromId)}
                                                size={28}
                                            />
                                            <span className="min-w-0 truncate text-h8">
                                                {nameOf(settlement.fromId)}
                                            </span>
                                            <Icon name="arrow-right" size={14} className="shrink-0 text-grey-1" />
                                            <MemberAvatar
                                                name={nameOf(settlement.toId)}
                                                avatar={avatarOf(settlement.toId)}
                                                size={28}
                                            />
                                            <span className="min-w-0 truncate text-h8">{nameOf(settlement.toId)}</span>
                                        </span>
                                        <Money
                                            minor={settlement.amountMinor}
                                            currency={state.room.currency}
                                            catalog={currencies}
                                            className="shrink-0 text-h7"
                                        />
                                    </li>
                                ))}
                            </ul>
                            <p className="text-sm text-grey-1">{t('recordedHint')}</p>
                        </div>
                    )}

                    {selected && (
                        <motion.div
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                            className="flex flex-col gap-5"
                        >
                            <div className="shadow-4 flex items-center justify-center gap-3 rounded-sm border border-n-1 bg-white p-4">
                                <span className="flex min-w-0 items-center gap-2">
                                    <MemberAvatar
                                        name={nameOf(selected.fromId)}
                                        avatar={avatarOf(selected.fromId)}
                                        size={36}
                                    />
                                    <span className="truncate text-h8">{nameOf(selected.fromId)}</span>
                                </span>
                                <Icon name="arrow-right" size={18} className="shrink-0" />
                                <span className="flex min-w-0 items-center gap-2">
                                    <MemberAvatar
                                        name={nameOf(selected.toId)}
                                        avatar={avatarOf(selected.toId)}
                                        size={36}
                                    />
                                    <span className="truncate text-h8">{nameOf(selected.toId)}</span>
                                </span>
                            </div>
                            {/* The suggestion, editable. It arrives filled in, so
                                the common case is still one tap — but a debt that
                                was half paid can be recorded as half paid instead
                                of as a lie or as nothing at all. */}
                            <motion.label
                                initial={{ scale: 0.86, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 320, damping: 17, delay: 0.06 }}
                                className="flex flex-col gap-2"
                            >
                                <span className="text-h8 uppercase tracking-wide text-grey-1">{t('amountLabel')}</span>
                                <BaseInput
                                    value={amount}
                                    onChange={(event) => {
                                        setAmount(event.target.value)
                                        setError(null)
                                    }}
                                    inputMode="decimal"
                                    autoComplete="off"
                                    maxLength={20}
                                    variant="lg"
                                    className="text-center text-h3 tabular-nums"
                                    data-testid="settle-amount"
                                />
                                <span className="text-center text-sm text-grey-1">
                                    {t('amountHint')}{' '}
                                    <Money
                                        minor={selected.amountMinor}
                                        currency={state.room.currency}
                                        catalog={currencies}
                                    />
                                </span>
                            </motion.label>

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
                                                    'flex min-h-13 flex-col items-center gap-1 rounded-sm border border-n-1 p-3 text-center transition-transform active:translate-y-[2px]',
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

                            <DrawerActions>
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
                            </DrawerActions>
                        </motion.div>
                    )}
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}
