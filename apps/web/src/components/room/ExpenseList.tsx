'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
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
import { dayLabel, expenseRowLabel, groupByDay } from '@/lib/dates'
import { matchExpenseCategory } from '@/lib/expense-category'
import { Button } from '@/components/ui/Button'
import { Doodle } from '@/components/ui/Doodle'
import { Money } from './Money'
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
    /** Empty rooms make both useful next steps explicit. Keeping these as
     *  separate callbacks lets the room screen decide how each surface opens. */
    onShare: () => void
    onAdd: () => void
}

const isPending = (expense: ApiExpense) => isPendingExpenseId(expense.id)

/** Long enough to strip the class again; the animation itself is 100ms. */
const POP_MS = 260
const LONG_PRESS_MS = 450
const LONG_PRESS_MOVE_PX = 8
const SUPPRESS_CLICK_MS = 700

/**
 * Matching can include a conservative typo scan across the term catalog. Keeping the
 * art in a memoized leaf means reaction, gesture and polling state do not repeat
 * that work for every unchanged row.
 */
const ExpenseSubjectArt = memo(function ExpenseSubjectArt({ description }: { description: string }) {
    const subject = matchExpenseCategory(description).subject

    return (
        <span
            className="flex h-11 w-11 shrink-0 items-center justify-center self-center text-n-1"
            data-expense-subject={subject.id}
            data-testid="expense-subject-doodle"
        >
            <Doodle name={subject.doodle} size={44} weight={1.4} />
        </span>
    )
})

export interface ExpensePersonalPosition {
    direction: 'lent' | 'borrowed' | 'total'
    amountMinor: string
    currency: string
}

/**
 * A saved expense's net effect on this viewer, in room currency. Drafts have no
 * authoritative FX or shares yet, so they deliberately use the amount that was
 * entered instead of inventing a room-currency position.
 */
export function getExpensePersonalPosition(
    expense: ApiExpense,
    roomCurrency: string,
    meId: string | undefined,
    memberIds: readonly string[],
    unsaved: boolean
): ExpensePersonalPosition {
    if (unsaved) {
        return { direction: 'total', amountMinor: expense.amountMinor, currency: expense.currency }
    }

    const validMeId = meId && memberIds.includes(meId) ? meId : undefined
    const impact = personalExpenseImpact(expense, validMeId)
    if (!impact || impact.direction === 'neutral') {
        return { direction: 'total', amountMinor: expense.baseAmountMinor, currency: roomCurrency }
    }
    return {
        direction: impact.direction === 'incoming' ? 'lent' : 'borrowed',
        amountMinor: impact.amountMinor,
        currency: roomCurrency,
    }
}

interface ExpensePress {
    expenseId: string
    pointerId: number
    startX: number
    startY: number
    timer: number
    longPressed: boolean
    moved: boolean
}

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
    onShare,
    onAdd,
    savedActionsDisabled = false,
}: ExpenseListProps) {
    const t = useTranslations('room.expenses')
    const tDates = useTranslations('dates')
    const tOffline = useTranslations('offline')
    const locale = useLocale()
    const motionAllowed = useMotionAllowed()
    const poppedId = usePoppedExpenseId(state.expenses)
    const queued = useQueuedWrites(slug)
    const [openReactionExpenseId, setOpenReactionExpenseId] = useState<string | null>(null)
    const press = useRef<ExpensePress | null>(null)
    const suppressClickExpenseId = useRef<string | null>(null)
    const suppressClickTimer = useRef<number | null>(null)
    /** Expenses and payments in one list, newest first — see `lib/timeline.ts`
     *  for why a settlement's `createdAt` is the date it interleaves on. */
    const timeline = useMemo(() => roomTimeline(state.expenses, state.settlements), [state.expenses, state.settlements])

    const clearPress = () => {
        if (press.current) window.clearTimeout(press.current.timer)
        press.current = null
    }

    const clearClickSuppression = () => {
        if (suppressClickTimer.current !== null) window.clearTimeout(suppressClickTimer.current)
        suppressClickTimer.current = null
        suppressClickExpenseId.current = null
    }

    const suppressNextClick = (expenseId: string) => {
        clearClickSuppression()
        suppressClickExpenseId.current = expenseId
        suppressClickTimer.current = window.setTimeout(clearClickSuppression, SUPPRESS_CLICK_MS)
    }

    useEffect(
        () => () => {
            clearPress()
            clearClickSuppression()
        },
        []
    )

    useEffect(() => {
        if (!savedActionsDisabled) return
        clearPress()
        clearClickSuppression()
        setOpenReactionExpenseId(null)
    }, [savedActionsDisabled])

    useEffect(() => {
        if (!openReactionExpenseId) return
        const closeOutside = (event: PointerEvent) => {
            const target = event.target
            if (!(target instanceof Element)) return
            const item = target.closest('[data-expense-history-item]')
            if (item?.getAttribute('data-expense-id') === openReactionExpenseId) return
            setOpenReactionExpenseId(null)
        }
        document.addEventListener('pointerdown', closeOutside)
        return () => document.removeEventListener('pointerdown', closeOutside)
    }, [openReactionExpenseId])

    const startPress = (event: ReactPointerEvent<HTMLButtonElement>, expenseId: string, canLongPress: boolean) => {
        if (!canLongPress || !event.isPrimary || event.button !== 0) return
        clearPress()
        const nextPress: ExpensePress = {
            expenseId,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            timer: 0,
            longPressed: false,
            moved: false,
        }
        nextPress.timer = window.setTimeout(() => {
            if (press.current !== nextPress) return
            nextPress.longPressed = true
            suppressClickExpenseId.current = expenseId
            setOpenReactionExpenseId(expenseId)
        }, LONG_PRESS_MS)
        press.current = nextPress
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const movePress = (event: ReactPointerEvent<HTMLButtonElement>, expenseId: string) => {
        const current = press.current
        if (!current || current.expenseId !== expenseId || current.pointerId !== event.pointerId) return
        if (
            Math.abs(event.clientX - current.startX) <= LONG_PRESS_MOVE_PX &&
            Math.abs(event.clientY - current.startY) <= LONG_PRESS_MOVE_PX
        ) {
            return
        }
        window.clearTimeout(current.timer)
        current.moved = true
        if (current.longPressed && openReactionExpenseId === expenseId) {
            setOpenReactionExpenseId(null)
        }
    }

    const finishPress = (event: ReactPointerEvent<HTMLButtonElement>, expenseId: string) => {
        const current = press.current
        if (!current || current.expenseId !== expenseId || current.pointerId !== event.pointerId) return
        const shouldSuppressClick = current.longPressed || current.moved
        clearPress()
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
        if (!shouldSuppressClick) return

        // Mobile browsers can synthesize the click well after pointer release.
        // Keep the guard beyond that delay, but consume it as soon as the
        // expected click arrives.
        suppressNextClick(expenseId)
    }

    const cancelPress = (event: ReactPointerEvent<HTMLButtonElement>, expenseId: string) => {
        const current = press.current
        if (!current || current.expenseId !== expenseId || current.pointerId !== event.pointerId) return
        clearPress()
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
        if (suppressClickExpenseId.current === expenseId) clearClickSuppression()
        if (current.longPressed && openReactionExpenseId === expenseId) {
            setOpenReactionExpenseId(null)
        }
    }

    const selectExpense = (expenseId: string) => {
        if (suppressClickExpenseId.current === expenseId) {
            clearClickSuppression()
            return
        }
        setOpenReactionExpenseId(null)
        onSelect(expenseId)
    }

    // The empty state belongs to the whole history, not to the expenses alone: a
    // room holding a payment and no expenses has something to show.
    if (timeline.length === 0) {
        return (
            <motion.section
                initial={motionAllowed ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={motionAllowed ? { type: 'spring', stiffness: 300, damping: 28 } : { duration: 0 }}
                data-motion-surface
                className="flex flex-col items-center gap-4 px-4 py-6 text-center sm:py-12"
            >
                <motion.div
                    initial={motionAllowed ? { scale: 0.7, rotate: -8, opacity: 0 } : false}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={
                        motionAllowed ? { type: 'spring', stiffness: 300, damping: 15, delay: 0.08 } : { duration: 0 }
                    }
                    data-motion-surface
                >
                    <Image
                        src={peanutThinking}
                        alt=""
                        unoptimized
                        className="h-20 w-20 object-contain sm:h-32 sm:w-32"
                    />
                </motion.div>
                <p className="text-h6">{t('emptyTitle')}</p>
                <p className="max-w-[18rem] text-sm text-grey-1">{t('emptyBody')}</p>
                <div className="flex w-full max-w-[18rem] flex-col gap-3">
                    <Button
                        variant="primary"
                        shadowSize="4"
                        icon="share"
                        className="justify-center text-h7"
                        onClick={onShare}
                        data-testid="empty-share"
                    >
                        {t('emptyShare')}
                    </Button>
                    <Button
                        variant="stroke"
                        icon="plus"
                        className="justify-center"
                        onClick={onAdd}
                        data-testid="open-add-expense"
                    >
                        {t('emptyAdd')}
                    </Button>
                </div>
            </motion.section>
        )
    }

    const dayOptions = { locale, today: tDates('today'), yesterday: tDates('yesterday') }
    const memberName = (id: string) => state.members.find((member) => member.id === id)?.name ?? t('someone')
    // A stale device identity is not permission to call somebody in this room
    // "you". Spectators still see the expense totals, just without personal
    // direction claims.
    const validMeId = meId && state.members.some((member) => member.id === meId) ? meId : undefined
    const memberIds = state.members.map((member) => member.id)
    const viewerIsMember = !!validMeId
    const groups = groupByDay(timeline, (entry) => entry.date)

    return (
        <section aria-label={t('title')} className="flex flex-col gap-5 px-4">
            {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-2">
                    <h3 id={`expense-day-${group.key}`} className="text-h8 uppercase tracking-wide text-grey-1">
                        {dayLabel(group.items[0].date, dayOptions)}
                    </h3>
                    <ul
                        aria-labelledby={`expense-day-${group.key}`}
                        className="shadow-4 flex flex-col divide-y divide-grey-2 rounded-sm border border-n-1 bg-white"
                    >
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
                                            className="p-2"
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
                                const queuedExpense = isQueuedExpenseId(expense.id, queued)
                                const unsaved = isPending(expense) || queuedExpense
                                const impact = unsaved ? null : personalExpenseImpact(expense, validMeId)
                                const personalPosition = getExpensePersonalPosition(
                                    expense,
                                    state.room.currency,
                                    validMeId,
                                    memberIds,
                                    unsaved
                                )
                                const personalDirection =
                                    personalPosition.direction === 'lent'
                                        ? t('youLent')
                                        : personalPosition.direction === 'borrowed'
                                          ? t('youBorrowed')
                                          : t('total')
                                const actionsDisabled = isPending(expense) || savedActionsDisabled
                                const canReactToExpense = !unsaved && !savedActionsDisabled && !!validMeId && !!token
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
                                        data-expense-history-item
                                        data-expense-id={expense.id}
                                        className="flex flex-col"
                                    >
                                        <button
                                            type="button"
                                            disabled={actionsDisabled}
                                            aria-describedby={
                                                savedActionsDisabled ? 'room-stale-warning-copy' : undefined
                                            }
                                            onPointerDown={(event) => startPress(event, expense.id, canReactToExpense)}
                                            onPointerMove={(event) => movePress(event, expense.id)}
                                            onPointerUp={(event) => finishPress(event, expense.id)}
                                            onPointerCancel={(event) => cancelPress(event, expense.id)}
                                            onLostPointerCapture={(event) => cancelPress(event, expense.id)}
                                            onContextMenu={(event) => {
                                                if (!canReactToExpense) return
                                                event.preventDefault()
                                                const current = press.current
                                                if (current?.expenseId === expense.id) {
                                                    current.longPressed = true
                                                    suppressClickExpenseId.current = expense.id
                                                } else {
                                                    suppressNextClick(expense.id)
                                                }
                                                setOpenReactionExpenseId(expense.id)
                                            }}
                                            onClick={() => selectExpense(expense.id)}
                                            data-testid="expense-row"
                                            data-description={expense.description}
                                            data-personal-impact={impact?.direction}
                                            data-impact-minor={impact?.signedMinor}
                                            // The pop rides the inner button, not the
                                            // motion.li: the li's transform is already
                                            // owned by motion, and two writers on one
                                            // property is a fight nobody wins.
                                            className={cn(
                                                'flex min-h-[4.75rem] w-full touch-pan-y select-none items-start gap-3 px-3 pb-2 pt-3 text-left transition-colors duration-100 active:bg-grey-3 disabled:active:bg-transparent',
                                                poppedId === expense.id && 'animate-pop'
                                            )}
                                        >
                                            {/* The description already names the purchase, so the subject art is
                                                decorative. Its bare 44px stroke replaces the old payer portrait;
                                                who paid remains on the secondary text line below. */}
                                            <ExpenseSubjectArt description={expense.description} />
                                            <span className="min-w-0 flex-1 pt-0.5">
                                                <span className="block truncate text-h7">
                                                    {/* Row label, not plain `expenseLabel`: these rows
                                                        sit under a day heading, so an unnamed one takes
                                                        the day AND its time — otherwise it reprints the
                                                        heading and two unnamed rows read identically. */}
                                                    {expenseRowLabel(expense.description, expense.date, dayOptions)}
                                                </span>
                                                {queuedExpense && (
                                                    <span className="block text-h10 uppercase tracking-wide text-grey-1">
                                                        {tOffline('rowHint')}
                                                    </span>
                                                )}
                                                <span className="mt-1 block truncate text-sm text-grey-1">
                                                    {viewerIsMember && expense.paidById === validMeId
                                                        ? t('paidByYouCompact')
                                                        : t('paidByCompact', { payer })}{' '}
                                                    <Money
                                                        minor={expense.amountMinor}
                                                        currency={expense.currency}
                                                        catalog={currencies}
                                                    />
                                                </span>
                                            </span>
                                            <span className="flex shrink-0 flex-col items-end gap-0.5">
                                                <span className="whitespace-nowrap text-h10 text-grey-1">
                                                    {personalDirection}
                                                </span>
                                                <Money
                                                    minor={personalPosition.amountMinor}
                                                    currency={personalPosition.currency}
                                                    catalog={currencies}
                                                    className="text-h5"
                                                />
                                            </span>
                                        </button>
                                        {/* Outside the row button, not inside
                                            it: a button cannot contain buttons,
                                            and the row's own tap target has to
                                            stay the whole row. */}
                                        {!isPending(expense) && (
                                            <div
                                                className={cn(
                                                    'flex justify-end px-3',
                                                    (expense.reactions.length > 0 ||
                                                        openReactionExpenseId === expense.id) &&
                                                        'pb-3'
                                                )}
                                            >
                                                <ReactionBar
                                                    slug={slug}
                                                    expense={expense}
                                                    members={state.members}
                                                    meId={validMeId}
                                                    token={token}
                                                    disabled={savedActionsDisabled}
                                                    pickerOpen={openReactionExpenseId === expense.id}
                                                    onPickerOpenChange={(open) => {
                                                        if (open && savedActionsDisabled) return
                                                        setOpenReactionExpenseId(open ? expense.id : null)
                                                    }}
                                                />
                                            </div>
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
