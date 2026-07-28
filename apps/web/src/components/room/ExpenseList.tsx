'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { peanutThinking } from '@/assets/mascot'
import type { ApiExpense, CurrencyInfo, RoomState } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { isQueuedExpenseId, useQueuedWrites } from '@/lib/offline-queue'
import { dayLabel, groupByDay } from '@/lib/dates'
import { Money } from './Money'
import { MemberAvatar } from './MemberAvatar'
import { ReactionBar } from './ReactionBar'

interface ExpenseListProps {
    state: RoomState
    currencies: readonly CurrencyInfo[]
    meId?: string
    /** Reactions are written against the expense id, which needs the room's slug
     *  for the cache key and the member token as proof. */
    slug: string
    token?: string | null
    onSelect: (expenseId: string) => void
}

const isPending = (expense: ApiExpense) => expense.id.startsWith('pending-')

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
        const arrived = [...ids].find((id) => !previous.has(id) && !id.startsWith('pending-'))
        if (!arrived) return

        setPoppedId(arrived)
        const timer = window.setTimeout(() => setPoppedId(null), POP_MS)
        return () => window.clearTimeout(timer)
    }, [expenses])

    return poppedId
}

export function ExpenseList({ state, currencies, meId, slug, token, onSelect }: ExpenseListProps) {
    const t = useTranslations('room.expenses')
    const tDates = useTranslations('dates')
    const tOffline = useTranslations('offline')
    const locale = useLocale()
    const poppedId = usePoppedExpenseId(state.expenses)
    const queued = useQueuedWrites(slug)

    if (state.expenses.length === 0) {
        return (
            <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                className="flex flex-col items-center gap-4 px-6 py-12 text-center"
            >
                <motion.div
                    initial={{ scale: 0.7, rotate: -8, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.08 }}
                >
                    <Image src={peanutThinking} alt="" unoptimized className="h-32 w-32 object-contain" />
                </motion.div>
                <p className="text-h6">{t('emptyTitle')}</p>
                <p className="max-w-[18rem] text-sm text-grey-1">{t('emptyBody')}</p>
            </motion.section>
        )
    }

    const memberName = (id: string) => state.members.find((member) => member.id === id)?.name ?? t('someone')
    const groups = groupByDay(state.expenses, (expense) => expense.date)

    return (
        <section aria-label={t('title')} className="flex flex-col gap-5 px-4">
            {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-2">
                    <h3 className="text-h8 uppercase tracking-wide text-grey-1">
                        {dayLabel(group.items[0].date, {
                            locale,
                            today: tDates('today'),
                            yesterday: tDates('yesterday'),
                        })}
                    </h3>
                    <ul className="flex flex-col gap-2">
                        {/* Default (sync) mode, deliberately: an optimistic `pending-…`
                            row is replaced by the real one under a different key, and
                            popLayout would keep the placeholder mounted alongside its
                            replacement — two rows for one expense. */}
                        <AnimatePresence initial={false}>
                            {group.items.map((expense) => {
                                const payer = memberName(expense.paidById)
                                const foreign = expense.currency !== state.room.currency
                                return (
                                    <motion.li
                                        key={expense.id}
                                        layout
                                        // Moment #3: a new row does not fade in, it drops in
                                        // and settles — the same weight as the balances counting.
                                        initial={{ opacity: 0, y: -14, scale: 0.96 }}
                                        animate={{ opacity: isPending(expense) ? 0.55 : 1, y: 0, scale: 1 }}
                                        // No exit for the placeholder: it is not leaving,
                                        // it is being swapped for the real row, and an
                                        // animated departure would briefly double it up.
                                        exit={
                                            isPending(expense)
                                                ? undefined
                                                : {
                                                      opacity: 0,
                                                      scale: 0.92,
                                                      x: 12,
                                                      transition: { duration: 0.2, ease: 'easeIn' },
                                                  }
                                        }
                                        transition={{
                                            layout: { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 },
                                            default: { type: 'spring', stiffness: 380, damping: 24, mass: 0.8 },
                                        }}
                                    >
                                        <button
                                            type="button"
                                            disabled={isPending(expense)}
                                            onClick={() => onSelect(expense.id)}
                                            data-testid="expense-row"
                                            data-description={expense.description}
                                            // The pop rides the inner button, not the
                                            // motion.li: the li's transform is already
                                            // owned by motion, and two writers on one
                                            // property is a fight nobody wins.
                                            className={cn(
                                                'shadow-4 flex min-h-[3.5rem] w-full items-center gap-3 rounded-sm border border-n-1 bg-white p-3 text-left transition-transform duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0',
                                                poppedId === expense.id && 'animate-pop'
                                            )}
                                        >
                                            <MemberAvatar name={payer} size={36} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-h7">{expense.description}</span>
                                                {isQueuedExpenseId(expense.id, queued) && (
                                                    <span className="block text-sm text-grey-1">
                                                        {tOffline('rowHint')}
                                                    </span>
                                                )}
                                                <span className="block text-sm text-grey-1">
                                                    {t('paidBy', {
                                                        payer: expense.paidById === meId ? t('you') : payer,
                                                        count: expense.shares.length,
                                                    })}
                                                </span>
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
