'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { Icon } from '@/components/ui/Icon'
import { isApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { ApiExpense, CurrencyInfo, RoomState } from '@/lib/api-types'
import { roomProps, track } from '@/lib/analytics'
import { fromDateInputValue, toDateInputValue } from '@/lib/dates'
import {
    allocatedMinor,
    buildExpenseBody,
    emptyExpenseForm,
    expenseToFormValues,
    remainingMinor,
    validateExpenseForm,
    type ExpenseFormValues,
} from '@/lib/expense-form'
import { currencyInfo, equalSplitMinor, formatMinorPlain, formatMoney, parseAmountToMinor } from '@/lib/money'
import { useAddExpense, useDeleteExpense, useRestoreExpense, useUpdateExpense } from '@/lib/queries'
import { useFeedback } from '@/lib/use-settings'
import { CurrencySelect } from './CurrencySelect'
import { MemberAvatar } from './MemberAvatar'

interface ExpenseDrawerProps {
    open: boolean
    onClose: () => void
    slug: string
    state: RoomState
    currencies: readonly CurrencyInfo[]
    token?: string | null
    /** Null = add mode. */
    expense: ApiExpense | null
    defaultPaidById: string
}

const UNDO_MS = 6_000

export function ExpenseDrawer({
    open,
    onClose,
    slug,
    state,
    currencies,
    token,
    expense,
    defaultPaidById,
}: ExpenseDrawerProps) {
    const addExpense = useAddExpense(slug, token)
    const updateExpense = useUpdateExpense(slug, token)
    const deleteExpense = useDeleteExpense(slug, token)
    const restoreExpense = useRestoreExpense(slug, token)
    const feedback = useFeedback()

    const [values, setValues] = useState<ExpenseFormValues>(() =>
        emptyExpenseForm({ currency: state.room.currency, members: state.members, paidById: defaultPaidById })
    )
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Re-seed on every open: a drawer that remembers last time's amount is a
    // money bug waiting to happen.
    useEffect(() => {
        if (!open) return
        setSubmitted(false)
        setError(null)
        setValues(
            expense
                ? expenseToFormValues(expense, currencies)
                : emptyExpenseForm({
                      currency: state.room.currency,
                      members: state.members,
                      paidById: defaultPaidById,
                  })
        )
        // `currencies` and `state.members` intentionally excluded — a poll landing
        // mid-edit must not stomp on what is being typed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, expense?.id])

    const decimals = currencyInfo(values.currency, currencies).decimals
    const validation = validateExpenseForm(values, currencies)
    const remaining = remainingMinor(values, currencies)
    const remainingIsZero = remaining === '0'
    const totalMinor = parseAmountToMinor(values.amountInput, decimals)

    const patch = useCallback((next: Partial<ExpenseFormValues>) => setValues((prev) => ({ ...prev, ...next })), [])

    /** Switching to EXACT seeds an equal division, so the drawer opens reconciled
     *  and the cents visibly move only when you push them around. */
    const setSplitMode = (mode: 'EQUAL' | 'EXACT') => {
        if (mode === values.splitMode) return
        if (mode === 'EQUAL') {
            patch({ splitMode: 'EQUAL' })
            return
        }
        const participants = values.participantIds.length ? values.participantIds : state.members.map((m) => m.id)
        const shares = equalSplitMinor(totalMinor ?? '0', participants.length)
        const exactInputs: Record<string, string> = {}
        participants.forEach((memberId, index) => {
            exactInputs[memberId] = totalMinor ? formatMinorPlain(shares[index], decimals) : ''
        })
        patch({ splitMode: 'EXACT', exactInputs })
    }

    const toggleParticipant = (memberId: string) => {
        const has = values.participantIds.includes(memberId)
        patch({
            participantIds: has
                ? values.participantIds.filter((id) => id !== memberId)
                : [...values.participantIds, memberId],
        })
    }

    const putRemainderOn = (memberId: string) => {
        const current = parseAmountToMinor(values.exactInputs[memberId] ?? '', decimals) ?? '0'
        const next = BigInt(current) + BigInt(remaining)
        patch({
            exactInputs: {
                ...values.exactInputs,
                [memberId]: formatMinorPlain((next < 0n ? 0n : next).toString(), decimals),
            },
        })
    }

    const close = () => {
        onClose()
    }

    const save = async () => {
        setSubmitted(true)
        if (validation) return
        setError(null)
        const body = buildExpenseBody(values, currencies)
        try {
            if (expense) {
                await updateExpense.mutateAsync({ id: expense.id, input: body })
                track(
                    'expense_edited',
                    roomProps(slug, { splitMode: body.splitMode, foreign: body.currency !== state.room.currency })
                )
            } else {
                await addExpense.mutateAsync(body)
                track(
                    'expense_added',
                    roomProps(slug, { splitMode: body.splitMode, foreign: body.currency !== state.room.currency })
                )
            }
            // Moment #3, the audible half: pencil on paper as the row lands and
            // every affected balance starts counting.
            feedback('tick')
            close()
        } catch (err) {
            if (isApiError(err, 'EXPENSE_DELETED')) {
                setError('This expense was deleted. Undo the delete first, then edit it.')
                return
            }
            setError(isApiError(err) ? err.message : 'could not save the expense — try again')
        }
    }

    const remove = async () => {
        if (!expense) return
        const id = expense.id
        const description = expense.description
        try {
            await deleteExpense.mutateAsync(id)
            close()
            track('expense_deleted', roomProps(slug))
            toast(`"${description}" deleted`, {
                duration: UNDO_MS,
                action: {
                    label: 'Undo',
                    onClick: () => {
                        restoreExpense
                            .mutateAsync(id)
                            .then(() => {
                                track('expense_restored', roomProps(slug))
                                toast.success('Put back')
                            })
                            .catch(() => toast.error('Could not undo — refresh and try again'))
                    },
                },
            })
        } catch (err) {
            setError(isApiError(err) ? err.message : 'could not delete the expense')
        }
    }

    const participantsForExact = useMemo(
        () => state.members.filter((member) => values.exactInputs[member.id] !== undefined),
        [state.members, values.exactInputs]
    )
    const membersNotInExact = state.members.filter((member) => values.exactInputs[member.id] === undefined)

    const pending = addExpense.isPending || updateExpense.isPending

    return (
        <Drawer open={open} onOpenChange={(next) => !next && close()}>
            <DrawerContent className="bg-background">
                <DrawerHeader className="pb-0">
                    <DrawerTitle className="text-h5">{expense ? 'Edit expense' : 'Add expense'}</DrawerTitle>
                </DrawerHeader>

                <div className="flex flex-col gap-5 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4">
                    {/* Amount first: it's the thing you came to type. */}
                    <div className="flex items-end gap-3">
                        <label className="flex flex-1 flex-col gap-2">
                            <span className="text-h8 uppercase tracking-wide text-grey-1">Amount</span>
                            <input
                                value={values.amountInput}
                                onChange={(event) => patch({ amountInput: event.target.value })}
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder={decimals === 0 ? '0' : '0.00'}
                                aria-label="Amount"
                                data-testid="expense-amount"
                                className="input h-20 px-4 text-h3 tabular-nums"
                            />
                        </label>
                        <div className="w-[7.5rem] shrink-0">
                            <CurrencySelect
                                value={values.currency}
                                onChange={(code) => patch({ currency: code })}
                                currencies={currencies}
                                aria-label="Expense currency"
                                data-testid="expense-currency"
                            />
                        </div>
                    </div>

                    <label className="flex flex-col gap-2">
                        <span className="text-h8 uppercase tracking-wide text-grey-1">What for?</span>
                        <BaseInput
                            value={values.description}
                            onChange={(event) => patch({ description: event.target.value })}
                            placeholder="Dinner, taxi, lift pass…"
                            maxLength={255}
                            data-testid="expense-description"
                        />
                    </label>

                    <div className="flex flex-col gap-2">
                        <span className="text-h8 uppercase tracking-wide text-grey-1">Paid by</span>
                        <div className="flex flex-wrap gap-2">
                            {state.members.map((member) => (
                                <button
                                    key={member.id}
                                    type="button"
                                    onClick={() => {
                                        patch({ paidById: member.id })
                                        feedback('tick')
                                    }}
                                    aria-pressed={values.paidById === member.id}
                                    data-testid="payer-chip"
                                    data-member={member.name}
                                    className={cn(
                                        'flex min-h-11 items-center gap-2 rounded-sm border border-n-1 py-2 pl-2 pr-3 text-h8 transition-all duration-100',
                                        values.paidById === member.id
                                            ? 'shadow-4 bg-primary-1'
                                            : 'bg-white active:translate-x-[2px] active:translate-y-[2px]'
                                    )}
                                >
                                    <MemberAvatar name={member.name} size={24} />
                                    {member.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-h8 uppercase tracking-wide text-grey-1">Split</span>
                            <div className="flex overflow-hidden rounded-sm border border-n-1">
                                {(['EQUAL', 'EXACT'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => {
                                            setSplitMode(mode)
                                            feedback('tick')
                                        }}
                                        aria-pressed={values.splitMode === mode}
                                        data-testid={`split-${mode.toLowerCase()}`}
                                        className={cn(
                                            'min-h-11 px-4 py-2 text-h8 transition-colors duration-150',
                                            values.splitMode === mode ? 'bg-n-1 text-white' : 'bg-white text-n-1'
                                        )}
                                    >
                                        {mode === 'EQUAL' ? 'Equally' : 'Exact amounts'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {values.splitMode === 'EQUAL' ? (
                            <ul className="flex flex-col gap-2">
                                {state.members.map((member) => {
                                    const checked = values.participantIds.includes(member.id)
                                    return (
                                        <li key={member.id}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    toggleParticipant(member.id)
                                                    feedback('tick')
                                                }}
                                                aria-pressed={checked}
                                                data-testid="participant-toggle"
                                                data-member={member.name}
                                                className={cn(
                                                    'flex min-h-11 w-full items-center gap-3 rounded-sm border border-n-1 p-3 text-left transition-all duration-150 active:translate-y-[2px]',
                                                    checked ? 'bg-white' : 'bg-grey-4 opacity-60'
                                                )}
                                            >
                                                <MemberAvatar name={member.name} size={28} />
                                                <span className="flex-1 truncate text-h8">{member.name}</span>
                                                <span
                                                    className={cn(
                                                        'flex size-6 items-center justify-center rounded-sm border border-n-1 transition-colors duration-150',
                                                        checked ? 'bg-primary-1' : 'bg-white'
                                                    )}
                                                >
                                                    <AnimatePresence initial={false}>
                                                        {checked && (
                                                            <motion.span
                                                                initial={{ scale: 0.2, opacity: 0 }}
                                                                animate={{ scale: 1, opacity: 1 }}
                                                                exit={{ scale: 0.2, opacity: 0 }}
                                                                transition={{
                                                                    type: 'spring',
                                                                    stiffness: 600,
                                                                    damping: 24,
                                                                }}
                                                                className="flex"
                                                            >
                                                                <Icon name="check" size={16} />
                                                            </motion.span>
                                                        )}
                                                    </AnimatePresence>
                                                </span>
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <ul className="flex flex-col gap-2">
                                    {participantsForExact.map((member) => (
                                        <li key={member.id} className="flex items-center gap-2">
                                            <MemberAvatar name={member.name} size={28} />
                                            <span className="w-20 shrink-0 truncate text-h8">{member.name}</span>
                                            <input
                                                value={values.exactInputs[member.id] ?? ''}
                                                onChange={(event) =>
                                                    patch({
                                                        exactInputs: {
                                                            ...values.exactInputs,
                                                            [member.id]: event.target.value,
                                                        },
                                                    })
                                                }
                                                inputMode="decimal"
                                                aria-label={`Exact amount for ${member.name}`}
                                                data-testid="exact-input"
                                                data-member={member.name}
                                                className="input h-12 flex-1 px-3 text-base tabular-nums"
                                            />
                                            {!remainingIsZero && (
                                                <button
                                                    type="button"
                                                    onClick={() => putRemainderOn(member.id)}
                                                    aria-label={`Put the remainder on ${member.name}`}
                                                    data-testid="put-remainder"
                                                    data-member={member.name}
                                                    className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white"
                                                >
                                                    <Icon name="plus" size={16} />
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>

                                {membersNotInExact.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {membersNotInExact.map((member) => (
                                            <button
                                                key={member.id}
                                                type="button"
                                                onClick={() =>
                                                    patch({
                                                        exactInputs: { ...values.exactInputs, [member.id]: '' },
                                                    })
                                                }
                                                className="rounded-sm border border-dashed border-n-1 px-3 py-2 text-h9"
                                            >
                                                + {member.name}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Moment #4 — the cents reconcile in front of you. The
                                    readout pops the instant it balances, so hitting zero
                                    is something that happened rather than something you
                                    have to go and read. */}
                                <motion.div
                                    data-testid="remaining-readout"
                                    animate={remainingIsZero ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                                    transition={{ duration: 0.3, ease: 'easeOut' }}
                                    className={cn(
                                        'flex items-center justify-between rounded-sm border border-n-1 px-3 py-3 text-h8 transition-colors duration-200',
                                        remainingIsZero ? 'bg-green-1' : 'bg-primary-3'
                                    )}
                                >
                                    <span>
                                        {remainingIsZero
                                            ? 'Every cent allocated'
                                            : remaining.startsWith('-')
                                              ? 'Over by'
                                              : 'Left to allocate'}
                                    </span>
                                    <span className="flex items-center gap-2 tabular-nums">
                                        {remainingIsZero ? (
                                            <Icon name="check" size={18} />
                                        ) : (
                                            formatMoney(
                                                remaining.startsWith('-') ? remaining.slice(1) : remaining,
                                                values.currency,
                                                currencies
                                            )
                                        )}
                                    </span>
                                </motion.div>
                                <p className="text-sm text-grey-1">
                                    Amounts are in {values.currency}
                                    {values.currency !== state.room.currency &&
                                        ` — converted to ${state.room.currency} at an indicative rate`}
                                    . Allocated{' '}
                                    {formatMoney(allocatedMinor(values, currencies), values.currency, currencies)} of{' '}
                                    {formatMoney(totalMinor ?? '0', values.currency, currencies)}.
                                </p>
                            </div>
                        )}
                    </div>

                    <label className="flex flex-col gap-2">
                        <span className="text-h8 uppercase tracking-wide text-grey-1">When</span>
                        <input
                            type="date"
                            value={toDateInputValue(values.date)}
                            onChange={(event) => patch({ date: fromDateInputValue(event.target.value, values.date) })}
                            aria-label="Expense date"
                            data-testid="expense-date"
                            className="input h-14 px-4"
                        />
                    </label>

                    {submitted && validation && (
                        <p role="alert" className="text-sm font-bold text-error">
                            {validation === 'DESCRIPTION_REQUIRED' &&
                                'Give it a name so everyone remembers what it was.'}
                            {validation === 'AMOUNT_REQUIRED' && 'Enter an amount greater than zero.'}
                            {validation === 'PAYER_REQUIRED' && 'Pick who paid.'}
                            {validation === 'NO_PARTICIPANTS' && 'Pick at least one person to split this between.'}
                            {validation === 'SHARES_DO_NOT_ADD_UP' && 'The exact amounts have to add up to the total.'}
                        </p>
                    )}

                    {error && (
                        <p role="alert" className="text-sm font-bold text-error">
                            {error}
                        </p>
                    )}

                    <div className="flex flex-col gap-3">
                        <Button
                            variant="primary"
                            shadowSize="4"
                            onClick={save}
                            loading={pending}
                            className="justify-center text-h6"
                            data-testid="save-expense"
                        >
                            {expense ? 'Save changes' : 'Add expense'}
                        </Button>
                        {expense && (
                            <Button
                                variant="stroke"
                                icon="trash"
                                onClick={remove}
                                loading={deleteExpense.isPending}
                                className="justify-center"
                                data-testid="delete-expense"
                            >
                                Delete
                            </Button>
                        )}
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    )
}
