'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody } from '@/components/ui/DrawerLayout'
import { Icon } from '@/components/ui/Icon'
import type { CurrencyInfo, RoomState } from '@/lib/api-types'
import { deriveBalance, derivePair } from '@/lib/balance-derivation'
import { cn } from '@/lib/cn'
import { isZeroMinor } from '@/lib/money'
import { useMotionAllowed } from '@/lib/use-motion'
import { DerivationSheet } from './DerivationSheet'
import { MemberAvatar } from './MemberAvatar'
import { Money } from './Money'
import { isFormerMember } from '@/lib/members'

interface BalanceDrawerProps {
    open: boolean
    onClose: () => void
    state: RoomState
    currencies: readonly CurrencyInfo[]
    /** Whose balance is being shown — the `?balance=` param. */
    memberId: string
    /** Highlighted card on the strip — "that one is me". */
    meId?: string
}

/** The strip's three tones, so the sheet opens looking like the card it came from. */
const toneFor = (net: string) => (isZeroMinor(net) ? 'bg-white' : net.startsWith('-') ? 'bg-error-1' : 'bg-green-1')

/**
 * One tap from a balance to its complete derivation.
 *
 * This is the answer to the complaint nobody names about splitting apps: they do the maths
 * and expect to be trusted, so people re-derive balances by hand from the activity list.
 * Every number here comes from rows already in `RoomState` — no request, no backend work,
 * nothing to trust that isn't on screen.
 *
 * The hero is the server's balance (the same string the card carries in `data-net`); the
 * "adds up to" line at the bottom of the sheet is the client's independent sum of the lines
 * above it. They are two different computations printed side by side on purpose. If they
 * ever disagree, the person holding the phone sees it before we do.
 */
export function BalanceDrawer({ open, onClose, state, currencies, memberId, meId }: BalanceDrawerProps) {
    const t = useTranslations('derivation')
    const tBalances = useTranslations('room.balances')
    const motionAllowed = useMotionAllowed()
    // Which suggested payment has the other side's balance unfolded under it. Ephemeral —
    // it does not survive closing the sheet, and has no business in the URL.
    const [expanded, setExpanded] = useState<string | null>(null)

    const member = state.members.find((candidate) => candidate.id === memberId)
    const derivation = useMemo(() => deriveBalance(state, memberId), [state, memberId])

    useEffect(() => {
        if (!open) setExpanded(null)
    }, [open])
    // Switching to another member's sheet must not leave the previous one's payment open.
    useEffect(() => setExpanded(null), [memberId])

    if (!member) return null

    const net = state.balances[memberId] ?? '0'
    // First person on your own sheet, third on everyone else's — the same branch the strip
    // and the derivation lines make. "Debe" over a card headed "Tú" is a sentence about
    // somebody else.
    const mine = memberId === meId
    const label = isZeroMinor(net)
        ? tBalances('settled')
        : net.startsWith('-')
          ? mine
              ? tBalances('youOwe')
              : tBalances('owes')
          : mine
            ? tBalances('youGetBack')
            : tBalances('getsBack')
    const nameOf = (id: string) => state.members.find((candidate) => candidate.id === id)?.name ?? t('someone')
    const avatarOf = (id: string) => state.members.find((candidate) => candidate.id === id)?.avatar ?? null
    const paletteOf = (id: string) => state.members.find((candidate) => candidate.id === id)?.avatarPalette ?? null
    const transfers = state.suggestedTransfers.filter(
        (transfer) => transfer.fromId === memberId || transfer.toId === memberId
    )

    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent data-testid="balance-drawer" data-member-id={memberId}>
                <DrawerHeader>
                    <DrawerTitle className="flex items-center gap-2 text-h5">
                        <MemberAvatar
                            name={member.name}
                            avatar={member.avatar}
                            palette={member.avatarPalette}
                            size={32}
                        />
                        <span className="min-w-0 truncate">{member.id === meId ? tBalances('you') : member.name}</span>
                        {isFormerMember(member) && (
                            <span className="rounded-full border border-n-1 px-2 py-0.5 text-xs uppercase">
                                {tBalances('former')}
                            </span>
                        )}
                    </DrawerTitle>
                    <p className="text-sm text-grey-1">{t('title')}</p>
                </DrawerHeader>

                <DrawerBody>
                    <motion.div
                        initial={motionAllowed ? { scale: 0.94, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={motionAllowed ? { type: 'spring', stiffness: 320, damping: 24 } : { duration: 0 }}
                        data-motion-surface
                        className={cn(
                            'shadow-4 flex flex-col items-center gap-1 rounded-sm border border-n-1 px-4 py-5',
                            toneFor(net)
                        )}
                    >
                        <span className="text-h8 uppercase tracking-wide text-n-1">{label}</span>
                        <Money
                            minor={net}
                            currency={state.room.currency}
                            catalog={currencies}
                            absolute
                            className="text-h2"
                        />
                    </motion.div>

                    <DerivationSheet
                        derivation={derivation}
                        currency={state.room.currency}
                        currencies={currencies}
                        meId={meId}
                    />

                    {transfers.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <span className="text-h8 uppercase tracking-wide text-grey-1">{t('suggestedTitle')}</span>
                            {/* Said out loud rather than papered over: the payment below is part of
                                a room-wide plan, not a debt between these two people. `derivePair`
                                explains why there is nothing else to show. */}
                            <p className="text-h10 leading-snug text-grey-1">{t('suggestedNote')}</p>

                            <ul className="flex flex-col gap-2">
                                {transfers.map((transfer) => {
                                    const sends = transfer.fromId === memberId
                                    const otherId = sends ? transfer.toId : transfer.fromId
                                    const key = `${transfer.fromId}-${transfer.toId}-${transfer.amountMinor}`
                                    const isOpen = expanded === key
                                    const pair = isOpen ? derivePair(state, memberId, otherId) : null
                                    return (
                                        <li
                                            key={key}
                                            data-testid="derivation-transfer"
                                            className="flex flex-col rounded-sm border border-n-1 bg-white"
                                        >
                                            <div className="flex items-center gap-2 p-3">
                                                <MemberAvatar
                                                    name={nameOf(otherId)}
                                                    avatar={avatarOf(otherId)}
                                                    palette={paletteOf(otherId)}
                                                    size={28}
                                                />
                                                <span className="min-w-0 flex-1 truncate text-h8">
                                                    {sends
                                                        ? mine
                                                            ? t('sendsYou', { name: nameOf(otherId) })
                                                            : t('sends', { name: nameOf(otherId) })
                                                        : mine
                                                          ? t('receivesYou', { name: nameOf(otherId) })
                                                          : t('receives', { name: nameOf(otherId) })}
                                                </span>
                                                <Money
                                                    minor={transfer.amountMinor}
                                                    currency={state.room.currency}
                                                    catalog={currencies}
                                                    className="shrink-0 text-h7"
                                                />
                                            </div>
                                            {/* The visible row stays exactly this height — a
                                                `before` pseudo-element pads the TAP target to the
                                                40px floor without it. It is `absolute`, so it adds
                                                nothing to this row's height and cannot push the
                                                derivation panel below it down. */}
                                            <button
                                                type="button"
                                                onClick={() => setExpanded(isOpen ? null : key)}
                                                aria-expanded={isOpen}
                                                data-testid="toggle-other-balance"
                                                className="relative flex items-center justify-between gap-2 border-t border-dashed border-n-4 px-3 py-2 text-left text-h9 text-grey-1 before:absolute before:-inset-1.5 before:content-['']"
                                            >
                                                {isOpen
                                                    ? t('hideOther', { name: nameOf(otherId) })
                                                    : t('showOther', { name: nameOf(otherId) })}
                                                <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} />
                                            </button>
                                            {pair && (
                                                <div className="border-t border-n-1 px-3 pb-3 pt-1">
                                                    <DerivationSheet
                                                        derivation={pair.other}
                                                        currency={state.room.currency}
                                                        currencies={currencies}
                                                        meId={meId}
                                                    />
                                                </div>
                                            )}
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )}
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}
