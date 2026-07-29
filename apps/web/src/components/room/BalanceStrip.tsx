'use client'

import { useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import type { CurrencyInfo, RoomState } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { isZeroMinor } from '@/lib/money'
import { savedExpenses } from '@/lib/pending'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'
import { AnimatedMoney } from './Money'
import { MemberAvatar } from './MemberAvatar'

interface BalanceStripProps {
    state: RoomState
    currencies: readonly CurrencyInfo[]
    /** Highlighted card — "that one is me". */
    meId?: string
    /** Opens that member's derivation. Every balance is one tap from its working. */
    onSelect: (memberId: string) => void
}

/**
 * Takes the translator rather than returning a key to look up later: every key stays a literal
 * at the point it is read, which is what lets `pnpm i18n:audit` verify all three exist.
 *
 * `mine` picks the first-person wording. Third-person copy on your own card is not a small
 * infelicity in Spanish — the strip said "debe" ("he/she owes") above a card labelled "Tú",
 * which reads as a sentence about somebody else. The derivation sheet already branches this
 * way for "you paid"; this is the same branch on the balance itself.
 */
const toneFor = (net: string, mine: boolean, t: (key: string) => string, anySavedExpenses: boolean) => {
    // Only the settled card takes the room's tint. Red and green carry meaning —
    // a theme is allowed to tint the neutral state and nothing else, or "owes"
    // stops being a colour you can trust across two rooms. Classic's tint is
    // white, so the default palette is unchanged.
    if (isZeroMinor(net))
        return {
            card: 'bg-[var(--split-theme-tint,#FFFFFF)]',
            // "settled up" is a claim about a debt that got paid. Before the
            // server holds a single expense there was no debt, so the zero is an
            // empty ledger and has to say so — the same false congratulation
            // `isRoomSettled` refuses one card lower. Every member of a brand-new
            // room read "SETTLED UP" the moment they joined.
            label: anySavedExpenses ? t('settled') : t('nothingYet'),
            labelClass: 'text-n-3',
        }
    if (net.startsWith('-'))
        return { card: 'bg-error-1', label: mine ? t('youOwe') : t('owes'), labelClass: 'text-n-1' }
    return { card: 'bg-green-1', label: mine ? t('youGetBack') : t('getsBack'), labelClass: 'text-n-1' }
}

/**
 * Debts first, deepest first; then the people who are owed.
 *
 * Roster order is arrival order, which is a fact about the past and not about who needs to do
 * something. What the strip is for is "who still has to pay" — so the person furthest under
 * water leads, and reading left to right walks the room from most owing to most owed. The id
 * tie-break keeps two equal balances from swapping places on every poll.
 */
const byDebtFirst = (balances: Record<string, string>) => (a: { id: string }, b: { id: string }) => {
    const left = BigInt(balances[a.id] ?? '0')
    const right = BigInt(balances[b.id] ?? '0')
    if (left !== right) return left < right ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Who is up and who is down, at a glance. Balances count to their new values
 * (moment #3) and a member who joins mid-trip springs in and pops (moment #2) —
 * both are driven purely by the 8s poll diff, no sockets.
 */
export function BalanceStrip({ state, currencies, meId, onSelect }: BalanceStripProps) {
    const t = useTranslations('room.balances')
    const tDerivation = useTranslations('derivation')
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()
    // Server truth, not the merged list: a queued expense has moved no balance
    // yet, so it cannot be the reason a zero stops meaning "nothing yet".
    const anySavedExpenses = savedExpenses(state.expenses).length > 0
    // Copied before sorting: `state.members` is the query cache's array, and sorting in place
    // would reorder it for every other reader of the same room.
    const ordered = useMemo(() => [...state.members].sort(byDebtFirst(state.balances)), [state.members, state.balances])
    // Seeded on the first render so the initial roster does not fire n pops.
    const known = useRef<Set<string> | null>(null)

    useEffect(() => {
        const ids = state.members.map((member) => member.id)
        if (known.current === null) {
            known.current = new Set(ids)
            return
        }
        const arrived = ids.some((id) => !known.current!.has(id))
        known.current = new Set(ids)
        if (arrived) feedback('pop')
    }, [state.members, feedback])

    return (
        <section aria-label={t('title')} className="flex flex-col gap-2">
            <h2 className="px-4 text-h8 uppercase tracking-wide text-grey-1">{t('title')}</h2>

            {/* The right-edge mask tells you there is more to scroll without a
                scrollbar, which mobile hides anyway. */}
            <div className="relative">
                <ul className="flex gap-3 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <AnimatePresence initial={false}>
                        {ordered.map((member) => {
                            const net = state.balances[member.id] ?? '0'
                            const tone = toneFor(net, member.id === meId, t, anySavedExpenses)
                            return (
                                <motion.li
                                    key={member.id}
                                    layout={motionAllowed}
                                    initial={motionAllowed ? { scale: 0.6, opacity: 0, y: 10 } : false}
                                    animate={{ scale: 1, opacity: 1, y: 0 }}
                                    exit={motionAllowed ? { scale: 0.6, opacity: 0 } : undefined}
                                    transition={
                                        motionAllowed
                                            ? { type: 'spring', stiffness: 340, damping: 18, mass: 0.8 }
                                            : { duration: 0 }
                                    }
                                    data-motion-surface
                                    data-testid="balance-card"
                                    data-member={member.name}
                                    // Raw server truth, so e2e asserts the balance and not
                                    // the animated text mid-transition.
                                    data-net={net}
                                    className={cn(
                                        'flex w-[8.5rem] shrink-0 rounded-sm border border-n-1',
                                        tone.card,
                                        member.id === meId && 'shadow-4'
                                    )}
                                >
                                    {/* The whole card is the target — a balance you cannot
                                        interrogate is the thing this product is against. */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            feedback('tick')
                                            onSelect(member.id)
                                        }}
                                        aria-label={tDerivation('openLabel', { name: member.name })}
                                        data-testid="open-balance"
                                        className="flex w-full flex-col gap-2 p-3 text-left transition-transform duration-100 active:scale-[0.97]"
                                    >
                                        <span className="flex items-center gap-2">
                                            <MemberAvatar name={member.name} avatar={member.avatar} size={28} />
                                            <span className="min-w-0 flex-1 truncate text-h8">
                                                {member.id === meId ? t('you') : member.name}
                                            </span>
                                        </span>
                                        {/* No letter-spacing here. At 10px the extra tracking
                                            rounds up to a full pixel on some glyph pairs and
                                            "SETTLED UP" starts reading "SET T LED UP"; 12px with
                                            natural spacing is both legible and stable. */}
                                        <span className={cn('text-h9 uppercase', tone.labelClass)}>{tone.label}</span>
                                        <AnimatedMoney
                                            minor={net}
                                            currency={state.room.currency}
                                            catalog={currencies}
                                            absolute
                                            className="text-h5"
                                        />
                                    </button>
                                </motion.li>
                            )
                        })}
                    </AnimatePresence>
                </ul>
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-background to-transparent"
                />
            </div>
        </section>
    )
}
