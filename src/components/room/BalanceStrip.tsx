'use client'

import { AnimatePresence, motion } from 'motion/react'
import { twMerge } from 'tailwind-merge'
import type { CurrencyInfo, RoomState } from '@/lib/api-types'
import { isZeroMinor } from '@/lib/money'
import { AnimatedMoney } from './Money'
import { MemberAvatar } from './MemberAvatar'

interface BalanceStripProps {
    state: RoomState
    currencies: readonly CurrencyInfo[]
    /** Highlighted card — "that one is me". */
    meId?: string
}

const toneFor = (net: string) => {
    if (isZeroMinor(net)) return { card: 'bg-white', label: 'settled up', labelClass: 'text-n-3' }
    if (net.startsWith('-')) return { card: 'bg-error-1', label: 'owes', labelClass: 'text-n-1' }
    return { card: 'bg-green-1', label: 'gets back', labelClass: 'text-n-1' }
}

/**
 * Who is up and who is down, at a glance. Balances count to their new values
 * (moment #3) and a member who joins mid-trip springs in (moment #2) — both are
 * driven purely by the 8s poll diff, no sockets.
 */
export function BalanceStrip({ state, currencies, meId }: BalanceStripProps) {
    return (
        <section aria-label="Balances" className="flex flex-col gap-2">
            <h2 className="px-4 text-h8 uppercase tracking-wide text-grey-1">Balances</h2>
            <ul className="flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <AnimatePresence initial={false}>
                    {state.members.map((member) => {
                        const net = state.balances[member.id] ?? '0'
                        const tone = toneFor(net)
                        return (
                            <motion.li
                                key={member.id}
                                layout
                                initial={{ scale: 0.7, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.7, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                                data-testid="balance-card"
                                data-member={member.name}
                                // Raw server truth, so e2e asserts the balance and not
                                // the animated text mid-transition.
                                data-net={net}
                                className={twMerge(
                                    'flex w-[8.5rem] shrink-0 flex-col gap-2 rounded-sm border border-n-1 p-3',
                                    tone.card,
                                    member.id === meId && 'shadow-4'
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <MemberAvatar name={member.name} size={28} />
                                    <span className="min-w-0 flex-1 truncate text-h8">
                                        {member.id === meId ? 'You' : member.name}
                                    </span>
                                </div>
                                <span className={twMerge('text-h10 uppercase tracking-wider', tone.labelClass)}>
                                    {tone.label}
                                </span>
                                <AnimatedMoney
                                    minor={net}
                                    currency={state.room.currency}
                                    catalog={currencies}
                                    absolute
                                    className="text-h6"
                                />
                            </motion.li>
                        )
                    })}
                </AnimatePresence>
            </ul>
        </section>
    )
}
