'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { peanutThinking } from '@/assets/mascot'
import type { ApiExpense, CurrencyInfo, RoomState } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { personalExpenseImpact } from '@/lib/expense-impact'
import { isQueuedExpenseId, useQueuedWrites } from '@/lib/offline-queue'
import { isPendingExpenseId } from '@/lib/pending'
import { roomTimeline } from '@/lib/timeline'
import { useMotionAllowed } from '@/lib/use-motion'
import { dayLabel, expenseRowLabel, groupByDay, relativeTime } from '@/lib/dates'
import { Button } from '@/components/ui/Button'
import { Money } from './Money'
import { MemberAvatar } from './MemberAvatar'
import { ReactionBar } from './ReactionBar'
import { SettlementRow } from './SettlementRow'

interface ExpenseListProps {
    state: RoomState
    currencies: readonly CurrencyInfo[]
    meId?: string
    /** Reactions are written against the expense id, which needs the room's slug
     *  for the cache key and the member token as proof. */
    slug: string
    token?: string | null
    onSelect: (expenseId: string) => void
    /** Cached rows are useful offline, but mutating server-owned history from a
     *  room we could not refresh risks acting on an expense that changed. */
    savedActionsDisabled?: boolean
    /** Opens the share drawer. The empty state's copy leads with the invite, so
     *  the action it names has to be one tap away, not behind a header glyph. */
    onInvite?: () => void
}

const isPending = (expense: ApiExpense) => isPendingExpenseId(expense.id)

/** Long enough to strip the class again; the animation itself is 100ms. */
const POP_MS = 260

/**
 * Which row, if any, should pop right now.
 *
 * "New" has to mean *this device just added it*, not "an id I have not seen",
 * or every poll that lands someone else's expense pops a row on your screen
 * while you are reading something else. The optimistic mutation is what carries
 * that knowledge: `useAddExpense` puts a `pending-…` row in the cache on save and
 * the authoritative state replaces it in one commit. So the row to pop is the
 * real id that arrived in the same render the placeholder left — a poll adds ids
 * but never removes a placeholder, so it never qualifies.
 */
function usePoppedExpenseId(expenses: readonly ApiExpense[]): string | null {
    const [poppedId, setPoppedId] = useState<string | null>(null)
    const seen = useRef<Set<string> | null>(null)
    const hadPending = useRef(false)

    useEffect(() => {
        const ids = new Set(expenses.map((expense) => expense.id))
        const previous = seen.current
        const placeholderWasThere = hadPending.current
        seen.current = ids
        hadPending.current = expenses.some(isPending)

        // No previous render to diff against (first paint of a room full of
        // expenses) — nothing here is new, it is just arriving.
        if (!previous || !placeholderWasThere) return
        const arrived = [...ids].find((id) => !previous.has(id) && !isPendingExpenseId(id))
        if (!arrived) return

        setPoppedId(arrived)
        const timer = window.setTimeout(() => setPoppedId(null), POP_MS)
        return () => window.clearTimeout(timer)
    }, [expenses])

    return poppedId
}

export function ExpenseList({
    state,
    currencies,
    meId,
    slug,
    token,
    onSelect,
    onInvite,
    savedActionsDisabled = false,
}: ExpenseListProps) {
    const t = useTranslations('room.expenses')
    const tDates = useTranslations('dates')
    const tOffline = useTranslations('offline')
    const locale = useLocale()
    const motionAllowed = useMotionAllowed()
    const poppedId = usePoppedExpenseId(state.expenses)
    const queued = useQueuedWrites(slug)
    /** Expenses and payments in one list, newest first — see `lib/timeline.ts`
     *  for why a settlement's `createdAt` is the date it interleaves on. */
    const timeline = useMemo(() => roomTimeline(state.expenses, state.settlements), [state.expenses, state.settlements])

    // The empty state belongs to the whole history, not to the expenses alone: a
    // room holding a payment and no expenses has something to show.
    if (timeline.length === 0) {
        return (
            <motion.section
                initial={motionAllowed ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={motionAllowed ? { type: 'spring', stiffness: 300, damping: 28 } : { duration: 0 }}
                data-motion-surface
                className="flex flex-col items-center gap-4 px-4 py-12 text-center"
            >
                <motion.div
                    initial={motionAllowed ? { scale: 0.7, rotate: -8, opacity: 0 } : false}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={
                        motionAllowed ? { type: 'spring', stiffness: 300, damping: 15, delay: 0.08 } : { duration: 0 }
                    }
                    data-motion-surface
                >
                    <Image src={peanutThinking} alt="" unoptimized className="h-32 w-32 object-contain" />
                </motion.div>
                <p className="text-h6">{t('emptyTitle')}</p>
                <p className="max-w-[18rem] text-sm text-grey-1">{t('emptyBody')}</p>
                {onInvite && (
                    <Button variant="stroke" icon="link" onClick={onInvite} data-testid="empty-invite">
                        {t('emptyInvite')}
                    </Button>
                )}
            </motion.section>
        )
    }

    const dayOptions = { locale, today: tDates('today'), yesterday: tDates('yesterday') }
    const memberName = (id: string) => state.members.find((member) => member.id === id)?.name ?? t('someone')
    const memberAvatar = (id: string) => state.members.find((member) => member.id === id)?.avatar ?? null
    const memberPalette = (id: string) => state.members.find((member) => member.id === id)?.avatarPalette ?? null
    // A stale device identity is not permission to call somebody in this room
    // "you". Spectators still see the expense totals, just without personal
    // direction claims or colour.
    const validMeId = meId && state.members.some((member) => member.id === meId) ? meId : undefined
    const pairCounterparty =
        validMeId && state.members.length === 2
            ? state.members.find((member) => member.id !== validMeId)?.name
            : undefined
    const groups = groupByDay(timeline, (entry) => entry.date)

    return (
        <section aria-label={t('title')} className="flex flex-col gap-5 px-4">
            {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-2">
                    <h3 className="text-h8 uppercase tracking-wide text-grey-1">
                        {dayLabel(group.items[0].date, dayOptions)}
                    </h3>
                    <ul className="flex flex-col gap-2">
                        {/* Default (sync) mode, deliberately: an optimistic `pending-…`
                            row is replaced by the real one under a different key, and
                            popLayout would keep the placeholder mounted alongside its
                            replacement — two rows for one expense. */}
                        <AnimatePresence initial={false}>
                            {group.items.map((entry) => {
                                if (entry.kind === 'settlement') {
                                    return (
                                        <motion.li
                                            key={entry.id}
                                            layout={motionAllowed}
                                            initial={motionAllowed ? { opacity: 0, y: -14, scale: 0.96 } : false}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={
                                                motionAllowed
                                                    ? {
                                                          opacity: 0,
                                                          scale: 0.92,
                                                          x: 12,
                                                          transition: { duration: 0.2, ease: 'easeIn' },
                                                      }
                                                    : undefined
                                            }
                                            transition={
                                                motionAllowed
                                                    ? {
                                                          layout: {
                                                              type: 'spring',
                                                              stiffness: 420,
                                                              damping: 34,
                                                              mass: 0.7,
                                                          },
                                                          default: {
                                                              type: 'spring',
                                                              stiffness: 380,
                                                              damping: 24,
                                                              mass: 0.8,
                                                          },
                                                      }
                                                    : { duration: 0 }
                                            }
                                            data-motion-surface
                                        >
                                            <SettlementRow
                                                slug={slug}
                                                settlement={entry.settlement}
                                                state={state}
                                                currencies={currencies}
                                                meId={meId}
                                                token={token}
                                                actionsDisabled={savedActionsDisabled}
                                            />
                                        </motion.li>
                                    )
                                }
                                const expense = entry.expense
                                const payer = memberName(expense.paidById)
                                const filedBy =
                                    expense.createdById === null
                                        ? t('filedByAnon')
                                        : expense.createdById === meId
                                          ? t('filedByYou')
                                          : t('filedBy', { name: memberName(expense.createdById) })
                                const foreign = expense.currency !== state.room.currency
                                const impact = isQueuedExpenseId(expense.id, queued)
                                    ? null
                                    : personalExpenseImpact(expense, validMeId)
                                const impactCopy = impact
                                    ? impact.direction === 'outgoing'
                                        ? pairCounterparty
                                            ? t('personalImpact.outgoingNamed', { name: pairCounterparty })
                                            : t('personalImpact.outgoing')
                                        : impact.direction === 'incoming'
                                          ? pairCounterparty
                                              ? t('personalImpact.incomingNamed', { name: pairCounterparty })
                                              : t('personalImpact.incoming')
                                          : impact.neutralReason === 'not-in-split'
                                            ? t('personalImpact.notInSplit')
                                            : t('personalImpact.neutral')
                                    : null
                                // `createdAt`, not `date`: this line is about the row being
                                // written — a dinner can be backdated, filing it cannot.
                                const filedWhen = relativeTime(expense.createdAt, {
                                    locale,
                                    justNow: tDates('justNow'),
                                })
                                return (
                                    <motion.li
                                        key={expense.id}
                                        layout={motionAllowed}
                                        // Moment #3: a new row does not fade in, it drops in
                                        // and settles — the same weight as the balances counting.
                                        initial={motionAllowed ? { opacity: 0, y: -14, scale: 0.96 } : false}
                                        animate={{ opacity: isPending(expense) ? 0.55 : 1, y: 0, scale: 1 }}
                                        // No exit for the placeholder: it is not leaving,
                                        // it is being swapped for the real row, and an
                                        // animated departure would briefly double it up.
                                        exit={
                                            !motionAllowed || isPending(expense)
                                                ? undefined
                                                : {
                                                      opacity: 0,
                                                      scale: 0.92,
                                                      x: 12,
                                                      transition: { duration: 0.2, ease: 'easeIn' },
                                                  }
                                        }
                                        transition={
                                            motionAllowed
                                                ? {
                                                      layout: {
                                                          type: 'spring',
                                                          stiffness: 420,
                                                          damping: 34,
                                                          mass: 0.7,
                                                      },
                                                      default: {
                                                          type: 'spring',
                                                          stiffness: 380,
                                                          damping: 24,
                                                          mass: 0.8,
                                                      },
                                                  }
                                                : { duration: 0 }
                                        }
                                        data-motion-surface
                                    >
                                        <button
                                            type="button"
                                            disabled={isPending(expense) || savedActionsDisabled}
                                            aria-describedby={
                                                savedActionsDisabled ? 'room-stale-warning-copy' : undefined
                                            }
                                            onClick={() => onSelect(expense.id)}
                                            data-testid="expense-row"
                                            data-description={expense.description}
                                            data-personal-impact={impact?.direction}
                                            data-impact-minor={impact?.signedMinor}
                                            // The pop rides the inner button, not the
                                            // motion.li: the li's transform is already
                                            // owned by motion, and two writers on one
                                            // property is a fight nobody wins.
                                            className={cn(
                                                'shadow-4 flex min-h-[3.5rem] w-full flex-col overflow-hidden rounded-sm border border-n-1 text-left transition-transform duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0',
                                                impact?.direction === 'outgoing' && 'bg-balance-outgoing',
                                                impact?.direction === 'incoming' && 'bg-balance-incoming',
                                                (!impact || impact.direction === 'neutral') && 'bg-white',
                                                poppedId === expense.id && 'animate-pop'
                                            )}
                                        >
                                            <span className="flex min-h-[3.5rem] w-full items-center gap-3 p-3">
                                                <MemberAvatar
                                                    name={payer}
                                                    avatar={memberAvatar(expense.paidById)}
                                                    palette={memberPalette(expense.paidById)}
                                                    size={36}
                                                />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-h8">
                                                        {/* Row label, not plain `expenseLabel`: these rows
                                                        sit under a day heading, so an unnamed one takes
                                                        the day AND its time — otherwise it reprints the
                                                        heading and two unnamed rows read identically. */}
                                                        {expenseRowLabel(expense.description, expense.date, dayOptions)}
                                                    </span>
                                                    {isQueuedExpenseId(expense.id, queued) && (
                                                        <span className="block text-sm text-grey-1">
                                                            {tOffline('rowHint')}
                                                        </span>
                                                    )}
                                                    <span className="block truncate text-sm text-grey-1">
                                                        {/* Separate first-person key, not an interpolated "you":
                                                        Spanish must conjugate — "Tú pagó" was a literal
                                                        grammar error on the most-read line in the app.
                                                        Truncated, not wrapped: the amount column next to
                                                        this one is `shrink-0`, so a wide amount squeezes
                                                        this flex-1 column narrow enough that "You paid ·
                                                        1 person" wrapped mid-phrase and nearly doubled the
                                                        row's height. */}
                                                        {expense.paidById === meId
                                                            ? t('paidByYou', { count: expense.shares.length })
                                                            : t('paidBy', { payer, count: expense.shares.length })}
                                                    </span>
                                                    {!isPending(expense) && (
                                                        <span className="block text-h10 uppercase tracking-wide text-grey-1">
                                                            {filedBy} · {filedWhen}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="flex shrink-0 flex-col items-end">
                                                    <Money
                                                        minor={expense.amountMinor}
                                                        currency={expense.currency}
                                                        catalog={currencies}
                                                        className="text-h7"
                                                    />
                                                    {foreign && !isPending(expense) && (
                                                        <span className="text-h10 text-grey-1">
                                                            ~{' '}
                                                            <Money
                                                                minor={expense.baseAmountMinor}
                                                                currency={state.room.currency}
                                                                catalog={currencies}
                                                            />{' '}
                                                            {t('indicative')}
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                            {impact && impactCopy && (
                                                <span
                                                    data-testid="expense-personal-impact"
                                                    className={cn(
                                                        'flex w-full items-center justify-between gap-3 border-t border-n-1/20 px-3 py-2 text-h9',
                                                        impact.direction === 'outgoing' &&
                                                            'text-balance-outgoing-accent',
                                                        impact.direction === 'incoming' &&
                                                            'text-balance-incoming-accent',
                                                        impact.direction === 'neutral' && 'text-n-3'
                                                    )}
                                                >
                                                    <span className="flex min-w-0 items-center gap-1.5">
                                                        {impact.direction !== 'neutral' && (
                                                            <span
                                                                aria-hidden="true"
                                                                className="shrink-0 text-sm leading-none"
                                                            >
                                                                {impact.direction === 'outgoing' ? '→' : '←'}
                                                            </span>
                                                        )}
                                                        <span>{impactCopy}</span>
                                                    </span>
                                                    {impact.direction !== 'neutral' && (
                                                        <Money
                                                            minor={impact.amountMinor}
                                                            currency={state.room.currency}
                                                            catalog={currencies}
                                                            className="shrink-0 text-h8"
                                                        />
                                                    )}
                                                </span>
                                            )}
                                        </button>
                                        {/* Outside the row button, not inside
                                            it: a button cannot contain buttons,
                                            and the row's own tap target has to
                                            stay the whole row. */}
                                        {!isPending(expense) && (
                                            <ReactionBar slug={slug} expense={expense} meId={meId} token={token} />
                                        )}
                                    </motion.li>
                                )
                            })}
                        </AnimatePresence>
                    </ul>
                </div>
            ))}
        </section>
    )
}
