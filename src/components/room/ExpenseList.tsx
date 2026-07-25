'use client'

import Image from 'next/image'
import { motion } from 'motion/react'
import { peanutThinking } from '@/assets/mascot'
import type { ApiExpense, CurrencyInfo, RoomState } from '@/lib/api-types'
import { dayLabel, groupByDay } from '@/lib/dates'
import { Money } from './Money'
import { MemberAvatar } from './MemberAvatar'

interface ExpenseListProps {
    state: RoomState
    currencies: readonly CurrencyInfo[]
    meId?: string
    onSelect: (expenseId: string) => void
}

const isPending = (expense: ApiExpense) => expense.id.startsWith('pending-')

export function ExpenseList({ state, currencies, meId, onSelect }: ExpenseListProps) {
    if (state.expenses.length === 0) {
        return (
            <section className="flex flex-col items-center gap-4 px-6 py-12 text-center">
                <Image src={peanutThinking} alt="" unoptimized className="h-32 w-32 object-contain" />
                <p className="text-h6">No expenses yet</p>
                <p className="max-w-[18rem] text-sm text-grey-1">
                    Add the first one — who paid, how much, and who it was for.
                </p>
            </section>
        )
    }

    const memberName = (id: string) => state.members.find((member) => member.id === id)?.name ?? 'Someone'
    const groups = groupByDay(state.expenses, (expense) => expense.date)

    return (
        <section aria-label="Expenses" className="flex flex-col gap-5 px-4">
            {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-2">
                    <h3 className="text-h8 uppercase tracking-wide text-grey-1">{dayLabel(group.items[0].date)}</h3>
                    <ul className="flex flex-col gap-2">
                        {group.items.map((expense) => {
                            const payer = memberName(expense.paidById)
                            const foreign = expense.currency !== state.room.currency
                            return (
                                <motion.li
                                    key={expense.id}
                                    layout
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: isPending(expense) ? 0.55 : 1, y: 0 }}
                                    transition={{ type: 'spring', stiffness: 340, damping: 26 }}
                                >
                                    <button
                                        type="button"
                                        disabled={isPending(expense)}
                                        onClick={() => onSelect(expense.id)}
                                        data-testid="expense-row"
                                        data-description={expense.description}
                                        className="shadow-4 flex w-full items-center gap-3 rounded-sm border border-n-1 bg-white p-3 text-left transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0"
                                    >
                                        <MemberAvatar name={payer} size={36} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-h7">{expense.description}</span>
                                            <span className="block text-sm text-grey-1">
                                                {expense.paidById === meId ? 'You' : payer} paid ·{' '}
                                                {expense.shares.length}{' '}
                                                {expense.shares.length === 1 ? 'person' : 'people'}
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
                                                    indicative
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                </motion.li>
                            )
                        })}
                    </ul>
                </div>
            ))}
        </section>
    )
}
