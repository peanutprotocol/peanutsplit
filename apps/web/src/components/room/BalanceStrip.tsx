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
export const balanceTone = (net: string, mine: boolean, t: (key: string) => string, anySavedExpenses: boolean) => {
    // Only the settled card takes the room's tint. The other two surfaces are
    // semantic ledger washes, deliberately separate from the product's error
    // and success colours. Words and arrows carry the direction; colour only
    // makes a long row of cards faster to scan.
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
            mark: '—' as const,
            direction: 'neutral' as const,
        }
    if (net.startsWith('-'))
        return {
            card: 'bg-balance-outgoing',
            label: mine ? t('youOwe') : t('owes'),
            labelClass: 'text-balance-outgoing-accent',
            mark: '→' as const,
            direction: 'outgoing' as const,
        }
    return {
        card: 'bg-balance-incoming',
        label: mine ? t('youGetBack') : t('getsBack'),
        labelClass: 'text-balance-incoming-accent',
        mark: '←' as const,
        direction: 'incoming' as const,
    }
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

/** Only what the pair card needs off a member, so the decision can be tested without a room. */
interface PairMember {
    id: string
    name: string
}

export interface PairCard {
    /**
     * The one subject of the card: whose name the sentence carries, whose net it publishes,
     * and whose derivation the tap opens. There is deliberately no second member here. A card
     * about Bea that opened Ana's working — and told a screen
     * reader "See how Ana's balance adds up" — shared no word with what the card said, which
     * is WCAG 2.5.3, and told Ana a sentence about Ana in the third person, which is the very
     * thing `balanceTone`'s `mine` branch exists to prevent.
     */
    about: PairMember
    /** `about`'s raw server net, unchanged — the same value the per-member card carries. */
    net: string
    label: string
    cardClass: string
    labelClass: string
    /** Redundant visual cue beside the complete relationship sentence. */
    mark: '←' | '→' | '—'
    /** Stable state for visual and browser tests; never inferred from colour. */
    direction: 'incoming' | 'outgoing' | 'neutral' | 'between-members'
}

/**
 * The longest name the pair sentence may carry.
 *
 * The sentence gets two lines. Wrapping it was not enough: "{name} owes you" puts the verb
 * LAST, so a first name plus a long surname spends line 1 on the first name, breaks the surname
 * across line 2, and the clamp eats the relationship words — which is the whole message. Only
 * the background tint was then left to say which way the money ran, and the name field takes 80
 * characters.
 *
 * So the name is capped where the sentence is built, and the wrap is only the backstop. 20 is
 * the largest cap that survives the worst shape — a two-letter first name and one unbreakable
 * surname, which strands the surname alone on line 2 — measured at 375px in Roboto Flex 800 at
 * 14px, the 265px the label column gets, across all three locales and both directions. A line
 * holds 20 of the widest capital (W) there, so a capped name plus its phrase always fits.
 *
 * This is a character count standing in for a width, so it is sized on Latin metrics. Only the
 * sentence is capped: the roster, the people list, the derivation sheet, the accessible name
 * and `data-member` all keep the name in full.
 */
export const MAX_SENTENCE_NAME_CHARS = 20

/** Code points, not UTF-16 units, so an emoji in a name is never cut into half a character. */
const forSentence = (name: string) => {
    const chars = [...name]
    if (chars.length <= MAX_SENTENCE_NAME_CHARS) return name
    return `${chars
        .slice(0, MAX_SENTENCE_NAME_CHARS - 1)
        .join('')
        .trimEnd()}…`
}

/**
 * The copy, the colour and the subject of the pair card, as data.
 *
 * Balances always sum to zero, so n people carry n−1 independent numbers. At n = 2 the second
 * card is the first one negated — one fact printed twice — and a reader scanning both can add
 * them into a debt twice the real size, or miss which of the two is the one to act on. So a
 * two-person room states the fact once, as a sentence.
 *
 * Everything is decided off `about`'s net, which is also what the card publishes as `data-net`,
 * so the label and the number can never disagree. Takes the translator for the same reason
 * `balanceTone` does: every key stays a literal where `pnpm i18n:audit` can see it.
 */
export function pairCard(
    members: readonly PairMember[],
    balances: Record<string, string>,
    meId: string | undefined,
    anySavedExpenses: boolean,
    t: (key: string, values?: Record<string, string>) => string
): PairCard {
    // Debtor first, on the comparator the strip already sorts by, so the name-to-name sentence
    // runs in the direction the money moves and two zeroes never swap between polls.
    const sorted = [...members].sort(byDebtFirst(balances))
    const debtor = sorted[0]
    const creditor = sorted[1]
    // `noUncheckedIndexedAccess` is off, so a short array types as two members and only fails
    // at the first property read — a blank room screen from a TypeError with no name on it.
    // Say what the contract is instead. The only caller has already checked the length.
    if (!debtor || !creditor) throw new Error(`pairCard needs exactly two members, got ${members.length}`)
    // A `meId` the roster does not hold is a stale device identity, not a member. Treat it the
    // same as a spectator: say who owes whom by name rather than claim one of them is you.
    const me = meId ? members.find((member) => member.id === meId) : undefined
    const about = me ? (me.id === debtor.id ? creditor : debtor) : debtor
    const net = balances[about.id] ?? '0'

    // Zero takes the room's tint for the same reason the strip's does: red and green carry
    // meaning, and a theme may only tint the neutral state. "settled up" is a claim about a
    // debt that got paid, so a room the server holds no expense for has to say "nothing yet".
    //
    // Named, because the state itself is not: every brand-new two-person room opens here, and
    // "settled up" over "$0.00" says whose settled-up it is nowhere. The strip prints the name
    // beside the tone word on every other card; this prints the same two parts in the same
    // order, with the separator the expense rows already use.
    if (isZeroMinor(net))
        return {
            about,
            net,
            label: `${forSentence(about.name)} · ${anySavedExpenses ? t('settled') : t('nothingYet')}`,
            cardClass: 'bg-[var(--split-theme-tint,#FFFFFF)]',
            labelClass: 'text-n-3',
            mark: '—',
            direction: 'neutral',
        }

    if (!me)
        // Neither name is the reader's, so the card takes the colour of the fact it states: a
        // debt is open. `about` is the debtor here, so its net is always the negative one.
        return {
            about,
            net,
            // Both names are capped. Two long ones can still reach a third line, but the verb
            // sits right after the debtor in all three locales, so the clamp never removes it.
            label: t('pair.owes', { debtor: forSentence(debtor.name), creditor: forSentence(creditor.name) }),
            cardClass: 'bg-balance-outgoing',
            labelClass: 'text-balance-outgoing-accent',
            mark: '→',
            direction: 'between-members',
        }

    if (net.startsWith('-'))
        return {
            about,
            net,
            label: t('pair.owesYou', { name: forSentence(about.name) }),
            cardClass: 'bg-balance-incoming',
            labelClass: 'text-balance-incoming-accent',
            mark: '←',
            direction: 'incoming',
        }

    return {
        about,
        net,
        label: t('pair.youOwe', { name: forSentence(about.name) }),
        cardClass: 'bg-balance-outgoing',
        labelClass: 'text-balance-outgoing-accent',
        mark: '→',
        direction: 'outgoing',
    }
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
    // Exactly two people is one number, not two. One and three-or-more keep the strip.
    const pair =
        state.members.length === 2 ? pairCard(state.members, state.balances, meId, anySavedExpenses, t) : undefined
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

    if (pair)
        return (
            <section aria-label={t('title')} className="flex flex-col gap-2">
                <h2 className="px-4 text-h8 uppercase tracking-wide text-grey-1">{t('title')}</h2>

                {/* `data-member` and `data-net` name the member the SENTENCE is about, not the
                    person reading the card: the counterparty when the device knows who it is,
                    the debtor when it does not. So in a two-person room a spec that used to read
                    the viewer's own net reads its negation here, off the other name.
                    `data-pair` is how a spec tells the two shapes apart — balances.spec.ts
                    asserts it is absent at one member and present at two. */}
                <div
                    data-motion-surface
                    data-testid="balance-card"
                    data-pair="true"
                    data-member={pair.about.name}
                    data-net={pair.net}
                    data-balance-direction={pair.direction}
                    className={cn(
                        'shadow-4 mx-4 mb-3 mt-1 flex overflow-hidden rounded-sm border border-n-1',
                        pair.cardClass
                    )}
                >
                    {/* The whole card is the target — a balance you cannot
                        interrogate is the thing this product is against. One subject
                        throughout: the tap opens the working of the member the sentence names,
                        and the accessible name says that member too. */}
                    <button
                        type="button"
                        onClick={() => {
                            feedback('tick')
                            onSelect(pair.about.id)
                        }}
                        data-testid="open-balance"
                        data-focus-contained
                        className="grid min-h-24 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sm p-3 text-left transition-transform duration-100 active:scale-[0.97]"
                    >
                        {/* Direction has one fixed, high-contrast place. The arrow and complete
                            sentence repeat the meaning, so the faint wash only speeds up the scan.
                            The two-person card does not need an avatar to repeat the one name
                            already in the sentence. */}
                        <span className={cn('flex min-w-0 items-start gap-2', pair.labelClass)}>
                            <span aria-hidden="true" className="shrink-0 text-h5 leading-none">
                                {pair.mark}
                            </span>
                            {/* Wraps rather than truncates. "{name} owes you" puts the verb
                                LAST, so an ellipsis eats the whole relationship and leaves a
                                clipped name over an amount, with only the green signal saying
                                which way the money runs — it started at about 23 characters at
                                375px. Two lines is the cap. The name is already cut to
                                MAX_SENTENCE_NAME_CHARS where the sentence is built, so those two
                                lines hold it at any name length; this clamp is the backstop, not
                                the fix. Splitting the string into a name element and a phrase
                                element is not an option, because Spanish puts the name last in
                                the other direction ("Le debes a {name}") and the order is the
                                translator's to choose. */}
                            <span className="line-clamp-2 min-w-0 break-words text-h8 leading-snug">{pair.label}</span>
                        </span>
                        {/* AnimatedMoney emits an accessible text node and a visual NumberFlow.
                            One wrapper keeps both in the amount column of this two-column grid. */}
                        <span className="shrink-0">
                            <AnimatedMoney
                                minor={pair.net}
                                currency={state.room.currency}
                                catalog={currencies}
                                absolute
                                density="overview"
                                className="text-h4 sm:text-h3"
                            />
                        </span>
                        {/* The visible sentence and amount now form the accessible name. Keep
                            the action hint too, without replacing them with an aria-label. */}
                        <span className="sr-only">{tDerivation('openLabel', { name: pair.about.name })}</span>
                    </button>
                </div>
            </section>
        )

    return (
        <section aria-label={t('title')} className="flex min-w-0 flex-col gap-2">
            <h2 className="px-4 text-h8 uppercase tracking-wide text-grey-1">{t('title')}</h2>

            {/* The right-edge mask tells you there is more to scroll without a
                scrollbar, which mobile hides anyway. */}
            <div className="relative min-w-0 overflow-hidden">
                <ul className="flex gap-3 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <AnimatePresence initial={false}>
                        {ordered.map((member) => {
                            const net = state.balances[member.id] ?? '0'
                            const tone = balanceTone(net, member.id === meId, t, anySavedExpenses)
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
                                    data-balance-direction={tone.direction}
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
                                        data-testid="open-balance"
                                        data-focus-contained
                                        className="flex w-full flex-col gap-2 rounded-sm p-3 text-left transition-transform duration-100 active:scale-[0.97]"
                                    >
                                        <span className="flex items-center gap-2">
                                            <MemberAvatar
                                                name={member.name}
                                                avatar={member.avatar}
                                                palette={member.avatarPalette}
                                                size={28}
                                            />
                                            <span className="min-w-0 flex-1 truncate text-h8">
                                                {member.id === meId ? t('you') : member.name}
                                            </span>
                                        </span>
                                        {/* No letter-spacing here. At 10px the extra tracking
                                            rounds up to a full pixel on some glyph pairs and
                                            "SETTLED UP" starts reading "SET T LED UP"; 12px with
                                            natural spacing is both legible and stable. */}
                                        <span
                                            className={cn('flex items-center gap-1 text-h9 uppercase', tone.labelClass)}
                                        >
                                            <span aria-hidden="true" className="text-sm leading-none">
                                                {tone.mark}
                                            </span>
                                            {tone.label}
                                        </span>
                                        <AnimatedMoney
                                            minor={net}
                                            currency={state.room.currency}
                                            catalog={currencies}
                                            absolute
                                            density="overview"
                                            className="text-h5"
                                        />
                                        <span className="sr-only">
                                            {tDerivation('openLabel', { name: member.name })}
                                        </span>
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
