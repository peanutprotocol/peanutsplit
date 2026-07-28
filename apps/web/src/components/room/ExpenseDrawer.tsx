'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Doodle } from '@/components/ui/Doodle'
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
import { useErrorMessage } from '@/lib/error-messages'
import { splitV2Enabled } from '@/lib/flags'
import { currencyInfo, formatMinorPlain, formatMoney, parseAmountToMinor } from '@/lib/money'
import {
    useAddExpense,
    useDeleteExpense,
    useJoinRoom,
    useModelStatus,
    useRestoreExpense,
    useUpdateExpense,
} from '@/lib/queries'
import { TOAST_MS } from '@/lib/toasts'
import { useCurrencyHints } from '@/lib/use-currency-hint'
import { convertMinorForPreview, useRate } from '@/lib/use-rate'
import { useFeedback } from '@/lib/use-settings'
import { useShake } from '@/hooks/useShake'
import { CurrencySelect } from './CurrencySelect'
import { CurrencyTag } from './CurrencyTag'
import { MemberAvatar } from './MemberAvatar'
import { Money } from './Money'
import { QuickAdd } from './QuickAdd'
import { ScanButton } from './scan/ScanButton'
import { ScanFlow } from './scan/ScanFlow'

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
    const t = useTranslations('room.expenseDrawer')
    const locale = useLocale()
    const errorMessage = useErrorMessage()
    const addExpense = useAddExpense(slug, token)
    const addMember = useJoinRoom(slug)
    const updateExpense = useUpdateExpense(slug, token)
    const deleteExpense = useDeleteExpense(slug, token)
    const restoreExpense = useRestoreExpense(slug, token)
    const feedback = useFeedback()
    const { ref: formRef, shake } = useShake<HTMLDivElement>()
    const hints = useCurrencyHints()

    const [values, setValues] = useState<ExpenseFormValues>(() =>
        emptyExpenseForm({ currency: state.room.currency, members: state.members, paidById: defaultPaidById })
    )
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)
    /**
     * The picked photo. Its presence IS the scan flow's open state — a separate
     * boolean would let the two disagree, and "the overlay is up with no image"
     * is a stuck screen with no way back.
     */
    const [scanFile, setScanFile] = useState<File | null>(null)
    const [addingPayer, setAddingPayer] = useState(false)
    const [newPayerName, setNewPayerName] = useState('')
    const [payerError, setPayerError] = useState<string | null>(null)
    const payerNameRef = useRef<HTMLInputElement>(null)
    /** A server capability for typed quick-add, asked rather than compiled in.
     *  Receipt scanning stays in the codebase as backlog work, but its entry
     *  point is intentionally absent from v1 after the post-scan overlay proved
     *  capable of trapping taps on real devices. */
    const { enabled: modelEnabled, resolved: modelResolved } = useModelStatus(slug, splitV2Enabled())

    // Re-seed on every open: a drawer that remembers last time's amount is a
    // money bug waiting to happen.
    useEffect(() => {
        if (!open) return
        setSubmitted(false)
        setError(null)
        // A half-finished scan must not survive the drawer closing: reopening
        // would drop the user back into someone else's receipt.
        setScanFile(null)
        setAddingPayer(false)
        setNewPayerName('')
        setPayerError(null)
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

    // Own effect rather than a line in the re-seed above: that one also runs when
    // you tap straight from one expense to another, and the sheet is already open
    // by then — a second blip for a sheet that never closed is a lie.
    useEffect(() => {
        if (open) feedback('blip')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const decimals = currencyInfo(values.currency, currencies).decimals
    const isForeign = values.currency !== state.room.currency
    /** The room's own currency leads: most expenses are in it, and it is the one code that is
     *  certainly relevant here. The device guess follows, for the traveller paying in their own. */
    const suggestedCurrencies = [state.room.currency, ...hints.map((hint) => hint.currency)].filter(
        (code, index, all) => all.indexOf(code) === index
    )
    const validation = validateExpenseForm(values, currencies)
    const remaining = remainingMinor(values, currencies)
    const remainingIsZero = remaining === '0'
    /** The green celebration. Zero left to allocate is NOT enough on its own —
     *  an untouched EXACT form is zero against zero, and cheering before the work
     *  starts spends the moment that was supposed to land at the end of it. */
    const allocationSettled = remainingIsZero && values.exactTouched
    const totalMinor = parseAmountToMinor(values.amountInput, decimals)

    const patch = useCallback((next: Partial<ExpenseFormValues>) => setValues((prev) => ({ ...prev, ...next })), [])

    const choosePayer = (memberId: string) => {
        patch({ paidById: memberId })
        setAddingPayer(false)
        setNewPayerName('')
        setPayerError(null)
        feedback('tick')
    }

    /**
     * This creates a roster entry, not a new identity for this device. The room
     * link is the credential and writes are trust-based, so the person holding
     * the phone may add Bea and record an expense Bea paid while remaining Ana.
     */
    const createPayer = async (event: React.FormEvent) => {
        event.preventDefault()
        const name = newPayerName.trim()
        if (!name || addMember.isPending) return

        const existing = state.members.find((member) => member.name.toLowerCase() === name.toLowerCase())
        if (existing) {
            choosePayer(existing.id)
            return
        }

        setPayerError(null)
        try {
            const next = await addMember.mutateAsync({ name })
            patch({ paidById: next.memberId })
            setAddingPayer(false)
            setNewPayerName('')
            feedback('pop')
        } catch (err) {
            feedback('error', { haptic: 'error' })
            if (isApiError(err, 'DUPLICATE_MEMBER_NAME')) {
                setPayerError(t('payerDuplicate', { name }))
                return
            }
            setPayerError(errorMessage(err, t('payerAddFailed')))
        }
    }

    /**
     * Switching to EXACT opens EMPTY, with the whole amount still to allocate.
     *
     * It used to pre-seed an equal division, which read as helpful and was not:
     * every field already held a number, so the first thing anyone did was clear
     * one — and a form that arrives "already correct" gives you nothing to do and
     * no way to tell whether it heard you. Empty fields plus a running "left to
     * allocate" is the same maths with the work visible.
     *
     * Editing a saved EXACT expense keeps its amounts; this only runs on a
     * deliberate mode switch.
     */
    const setSplitMode = (mode: 'EQUAL' | 'EXACT') => {
        if (mode === values.splitMode) return
        if (mode === 'EQUAL') {
            patch({ splitMode: 'EQUAL' })
            return
        }
        const participants = values.participantsTouched ? values.participantIds : state.members.map((m) => m.id)
        const exactInputs: Record<string, string> = {}
        for (const memberId of participants) exactInputs[memberId] = ''
        patch({ splitMode: 'EXACT', exactInputs, exactTouched: false })
    }

    const toggleParticipant = (memberId: string) => {
        // First touch materialises "everyone right now"; until then the form's
        // list is a stale snapshot and the wire omits it (server = everyone).
        const current = values.participantsTouched ? values.participantIds : state.members.map((m) => m.id)
        const has = current.includes(memberId)
        patch({
            participantsTouched: true,
            participantIds: has ? current.filter((id) => id !== memberId) : [...current, memberId],
        })
    }

    /** Every write into an EXACT field goes through here, so `exactTouched` cannot
     *  be set in one path and forgotten in another. */
    const editExact = (memberId: string, input: string) =>
        patch({ exactInputs: { ...values.exactInputs, [memberId]: input }, exactTouched: true })

    /** On blur, what was typed becomes what the currency actually looks like —
     *  "12" in a EUR room is 12.00, and a field that keeps saying "12" next to a
     *  neighbour saying "8.50" invites the reader to add them up wrong. A field
     *  left blank stays blank: it means "not in this split", not zero. */
    const normaliseExact = (memberId: string) => {
        const raw = values.exactInputs[memberId] ?? ''
        if (raw.trim().length === 0) return
        const minor = parseAmountToMinor(raw, decimals)
        if (minor === null) return
        editExact(memberId, formatMinorPlain(minor, decimals))
    }

    const putRemainderOn = (memberId: string) => {
        const current = parseAmountToMinor(values.exactInputs[memberId] ?? '', decimals) ?? '0'
        const next = BigInt(current) + BigInt(remaining)
        editExact(memberId, formatMinorPlain((next < 0n ? 0n : next).toString(), decimals))
    }

    const close = () => {
        onClose()
    }

    const save = async () => {
        setSubmitted(true)
        if (validation) {
            // The message alone is easy to miss on a long form — the sheet moving
            // is what tells you the tap was received and refused.
            feedback('error', { haptic: 'error' })
            shake()
            return
        }
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
            // every affected balance starts counting. The haptic is the two-pulse
            // `confirm` rather than the tick's single tap — an amount, a payer and
            // a split all landed at once, and that deserves a shape.
            feedback('tick', { haptic: 'confirm' })
            close()
        } catch (err) {
            feedback('error', { haptic: 'error' })
            shake()
            if (isApiError(err, 'EXPENSE_DELETED')) {
                setError(t('wasDeleted'))
                return
            }
            setError(errorMessage(err, t('saveFailed')))
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
            // The toast IS the undo window — it has to outlive "wait, did I mean
            // to do that?", which is why it takes the actionable duration.
            toast(t('deletedToast', { description }), {
                duration: TOAST_MS.actionable,
                action: {
                    label: t('undo'),
                    onClick: () => {
                        restoreExpense
                            .mutateAsync(id)
                            .then(() => {
                                track('expense_restored', roomProps(slug))
                                toast.success(t('restored'), { duration: TOAST_MS.state })
                            })
                            // "refresh and try again" is an instruction, not a status.
                            .catch(() => toast.error(t('restoreFailed'), { duration: TOAST_MS.actionable }))
                    },
                },
            })
        } catch (err) {
            feedback('error', { haptic: 'error' })
            setError(errorMessage(err, t('deleteFailed')))
        }
    }

    /**
     * "≈ 8,82 €" beside the currency pair. The note already said a conversion was
     * happening; what it would not say is HOW MUCH, which is the only part anyone
     * actually wants — a foreign expense is the most surprising row in the room
     * precisely because its room-currency size is invisible until it lands.
     *
     * Everything about it degrades quietly: no rate (probe failed, offline, a pair
     * the feed does not carry) or no amount typed yet and the note renders exactly
     * as it did before this existed.
     */
    const { data: rateQuote } = useRate(values.currency, state.room.currency)
    const convertedPreview = useMemo(() => {
        if (!isForeign || !rateQuote || !totalMinor) return null
        const roomDecimals = currencyInfo(state.room.currency, currencies).decimals
        const minor = convertMinorForPreview(totalMinor, rateQuote.rate, decimals, roomDecimals)
        return minor === null ? null : formatMoney(minor, state.room.currency, currencies, locale)
    }, [isForeign, rateQuote, totalMinor, state.room.currency, currencies, decimals, locale])

    const participantsForExact = useMemo(
        () => state.members.filter((member) => values.exactInputs[member.id] !== undefined),
        [state.members, values.exactInputs]
    )
    const membersNotInExact = state.members.filter((member) => values.exactInputs[member.id] === undefined)

    const pending = addExpense.isPending || updateExpense.isPending

    return (
        <Drawer open={open} onOpenChange={(next) => !next && close()}>
            <DrawerContent
                className="bg-background"
                /**
                 * The scan overlay is portalled to `document.body`, and Radix decides
                 * what is "outside" this sheet by containment — so every tap in the
                 * review screen was an outside interaction and the first one dismissed
                 * the drawer. `close()` clears the URL state, so the reviewed bill came
                 * back to a sheet that no longer existed and the user's form went with
                 * it. Vetoing by TARGET rather than by a piece of state is what makes
                 * this race-free: Radix dispatches the outside interaction on the click
                 * that follows the pointer-down, by which time any `scanFile`-shaped
                 * guard has already been cleared by the tap being handled.
                 */
                onPointerDownOutside={(event) => {
                    const target = event.detail.originalEvent.target
                    if (target instanceof Element && target.closest('[data-testid="scan-flow"]')) {
                        event.preventDefault()
                    }
                }}
            >
                <DrawerHeader className="pb-0">
                    <DrawerTitle className="text-h5">{expense ? t('editTitle') : t('addTitle')}</DrawerTitle>
                </DrawerHeader>

                <div
                    ref={formRef}
                    className="flex flex-col gap-5 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4"
                >
                    {/* Amount first: it's the thing you came to type. */}
                    <div className="flex items-end gap-3">
                        <label className="flex flex-1 flex-col gap-2">
                            <span className="text-h8 uppercase tracking-wide text-grey-1">{t('amount')}</span>
                            <input
                                value={values.amountInput}
                                onChange={(event) => patch({ amountInput: event.target.value })}
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder={decimals === 0 ? '0' : '0.00'}
                                aria-label={t('amount')}
                                data-testid="expense-amount"
                                className="input h-20 px-4 text-h3 tabular-nums"
                            />
                        </label>
                        {/* Wider than it was: the trigger now carries a flag and a symbol as
                            well as the code, and 7.5rem clipped "THB" to "T…" on a 390px screen. */}
                        <div className="w-[8.5rem] shrink-0">
                            <CurrencySelect
                                value={values.currency}
                                onChange={(code) => patch({ currency: code })}
                                currencies={currencies}
                                suggested={suggestedCurrencies}
                                aria-label={t('currency')}
                                data-testid="expense-currency"
                            />
                        </div>
                    </div>

                    {/* Right under the amount, and only when adding: quick add
                        rewrites the description, currency, total and split. That
                        is useful on an empty form and hostile on an edit. The
                        probe is a network hop, so its placeholder keeps the form
                        below from jumping as a thumb reaches the description. */}
                    {!expense && !modelResolved && (
                        <div aria-hidden="true" className="flex flex-wrap items-start gap-2">
                            {/* The scan chip's own placeholder, so the row reserves the
                                width it will actually take. Flag-off this is exactly the
                                one-chip placeholder v1 ships. */}
                            {splitV2Enabled() && (
                                <span className="min-h-11 w-32 animate-pulse rounded-sm border border-dashed border-grey-1 bg-grey-4 opacity-50" />
                            )}
                            <span className="min-h-11 w-28 animate-pulse rounded-sm border border-dashed border-grey-1 bg-grey-4 opacity-50" />
                        </div>
                    )}
                    {!expense && modelResolved && modelEnabled && (
                        <div className="flex flex-wrap items-start gap-2">
                            {/* Already behind the flag: `modelEnabled` is
                                `splitV2Enabled() && the server has a key`, so a v1 build
                                renders this row with quick-add alone, exactly as before. */}
                            <ScanButton onFile={setScanFile} />
                            <QuickAdd
                                slug={slug}
                                roomCurrency={state.room.currency}
                                currencies={currencies}
                                values={values}
                                onApply={(next) => {
                                    setValues(next)
                                    // The form has just been rewritten, so an error
                                    // left over from before it is stale by definition.
                                    setSubmitted(false)
                                    setError(null)
                                }}
                            />
                        </div>
                    )}

                    {/* Foreign money, said once and in both split modes. The old copy only
                        mentioned the conversion inside the EXACT branch, so an EQUAL split in
                        another currency converted silently — the row it produces is the single
                        most surprising thing in the room. */}
                    {isForeign && (
                        <div
                            data-testid="expense-foreign-note"
                            className="flex flex-wrap items-center gap-2 rounded-sm border border-dashed border-n-1 bg-primary-3 px-3 py-2 text-sm"
                        >
                            <CurrencyTag code={values.currency} catalog={currencies} />
                            <Icon name="arrow-right" size={14} className="shrink-0 text-grey-1" />
                            <CurrencyTag code={state.room.currency} catalog={currencies} />
                            {convertedPreview && (
                                <span data-testid="expense-foreign-preview" className="text-h8 tabular-nums">
                                    ≈ {convertedPreview}
                                </span>
                            )}
                            <span className="text-grey-1">{t('foreignHint')}</span>
                        </div>
                    )}

                    <label className="flex flex-col gap-2">
                        <span className="text-h8 uppercase tracking-wide text-grey-1">{t('description')}</span>
                        <BaseInput
                            value={values.description}
                            onChange={(event) => patch({ description: event.target.value })}
                            placeholder={t('descriptionPlaceholder')}
                            maxLength={255}
                            data-testid="expense-description"
                        />
                    </label>

                    <div className="flex flex-col gap-2">
                        <span className="text-h8 uppercase tracking-wide text-grey-1">{t('paidBy')}</span>
                        <div className="flex flex-wrap gap-2">
                            {state.members.map((member) => (
                                <button
                                    key={member.id}
                                    type="button"
                                    onClick={() => choosePayer(member.id)}
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
                                    <MemberAvatar name={member.name} avatar={member.avatar} size={24} />
                                    {member.name}
                                </button>
                            ))}
                            {!addingPayer && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setAddingPayer(true)
                                        setPayerError(null)
                                        requestAnimationFrame(() => payerNameRef.current?.focus())
                                    }}
                                    aria-label={t('addPayer')}
                                    title={t('addPayer')}
                                    className="flex min-h-11 items-center gap-2 rounded-sm border border-dashed border-n-1 bg-white px-3 py-2 text-h8 transition-colors hover:bg-grey-3"
                                    data-testid="add-payer"
                                >
                                    <Icon name="plus" size={18} />
                                    {t('addPayer')}
                                </button>
                            )}
                        </div>

                        {addingPayer && (
                            <form
                                onSubmit={createPayer}
                                className="flex flex-col gap-2 rounded-sm border border-dashed border-n-1 bg-white p-3"
                            >
                                <BaseInput
                                    ref={payerNameRef}
                                    value={newPayerName}
                                    onChange={(event) => setNewPayerName(event.target.value)}
                                    placeholder={t('payerNamePlaceholder')}
                                    aria-label={t('payerNamePlaceholder')}
                                    maxLength={80}
                                    variant="sm"
                                    data-testid="new-payer-name"
                                />
                                <div className="flex gap-2">
                                    <Button
                                        type="submit"
                                        size="small"
                                        shadowSize="3"
                                        loading={addMember.isPending}
                                        disabled={!newPayerName.trim()}
                                        className="flex-1 justify-center"
                                        data-testid="add-payer-submit"
                                    >
                                        {t('confirmPayer')}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="stroke"
                                        size="small"
                                        className="w-auto justify-center"
                                        onClick={() => {
                                            setAddingPayer(false)
                                            setNewPayerName('')
                                            setPayerError(null)
                                        }}
                                    >
                                        {t('cancelPayer')}
                                    </Button>
                                </div>
                            </form>
                        )}

                        {payerError && (
                            <p role="alert" className="text-sm font-bold text-error">
                                {payerError}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-h8 uppercase tracking-wide text-grey-1">{t('split')}</span>
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
                                        {mode === 'EQUAL' ? t('equally') : t('exactAmounts')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* "Equally" and "Exact amounts" name the modes; they do not say
                            what picking one DOES, and the difference is the whole decision.
                            One line for whichever is active — a hint under each button
                            would double the height of a control that is two words wide. */}
                        <p className="-mt-1 text-right text-sm text-grey-1" data-testid="split-hint">
                            {values.splitMode === 'EQUAL' ? t('equallyHint') : t('exactAmountsHint')}
                        </p>

                        {values.splitMode === 'EQUAL' ? (
                            <ul className="flex flex-col gap-2">
                                {state.members.map((member) => {
                                    const checked =
                                        !values.participantsTouched || values.participantIds.includes(member.id)
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
                                                <MemberAvatar name={member.name} avatar={member.avatar} size={28} />
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
                                            <MemberAvatar name={member.name} avatar={member.avatar} size={28} />
                                            <span className="w-20 shrink-0 truncate text-h8">{member.name}</span>
                                            <input
                                                value={values.exactInputs[member.id] ?? ''}
                                                onChange={(event) => editExact(member.id, event.target.value)}
                                                // Tap-and-type replaces. These fields arrive
                                                // holding a number often enough (the remainder
                                                // button, a reopened expense) that landing the
                                                // caret mid-digits and appending is the default
                                                // outcome — and "50" becoming "5060" is a wrong
                                                // number nobody reads back.
                                                onFocus={(event) => event.target.select()}
                                                onBlur={() => normaliseExact(member.id)}
                                                inputMode="decimal"
                                                aria-label={t('exactAmountFor', { name: member.name })}
                                                data-testid="exact-input"
                                                data-member={member.name}
                                                className="input h-12 flex-1 px-3 text-base tabular-nums"
                                            />
                                            {!remainingIsZero && (
                                                /* The chip says what it will do. A bare "+"
                                                   next to five names is five identical
                                                   buttons with five different effects, and the
                                                   one that SUBTRACTS is the one wearing a plus
                                                   sign. Printing the signed delta makes the
                                                   outcome readable before the tap. */
                                                <button
                                                    type="button"
                                                    onClick={() => putRemainderOn(member.id)}
                                                    aria-label={t('putRemainderOn', { name: member.name })}
                                                    data-testid="put-remainder"
                                                    data-member={member.name}
                                                    className="flex h-12 shrink-0 items-center justify-center rounded-sm border border-dashed border-n-1 bg-white px-2 text-h9 tabular-nums"
                                                >
                                                    {remaining.startsWith('-') ? '−' : '+'}
                                                    {formatMinorPlain(remaining.replace('-', ''), decimals)}
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
                                                {t('addToSplit', { name: member.name })}
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
                                    animate={allocationSettled ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                                    transition={{ duration: 0.3, ease: 'easeOut' }}
                                    className={cn(
                                        'flex items-center justify-between rounded-sm border border-n-1 px-3 py-3 text-h8 transition-colors duration-200',
                                        allocationSettled ? 'bg-green-1' : 'bg-primary-3'
                                    )}
                                >
                                    <span>
                                        {allocationSettled
                                            ? t('allocated')
                                            : remaining.startsWith('-')
                                              ? t('overBy')
                                              : t('leftToAllocate')}
                                    </span>
                                    <span className="flex items-center gap-2">
                                        {allocationSettled ? (
                                            <Icon name="check" size={18} />
                                        ) : (
                                            <Money
                                                minor={remaining}
                                                currency={values.currency}
                                                catalog={currencies}
                                                absolute
                                            />
                                        )}
                                    </span>
                                </motion.div>
                                {/* Three fragments rather than one message: the middle clause
                                    only exists for a foreign-currency expense, and folding it
                                    into an ICU `select` would make the common case unreadable in
                                    every catalog. */}
                                <p className="text-sm text-grey-1">
                                    {t('amountsAreIn', { currency: values.currency })}
                                    {values.currency !== state.room.currency &&
                                        t('convertedAt', { roomCurrency: state.room.currency })}
                                    {t('allocatedOf', {
                                        allocated: formatMoney(
                                            allocatedMinor(values, currencies),
                                            values.currency,
                                            currencies,
                                            locale
                                        ),
                                        total: formatMoney(totalMinor ?? '0', values.currency, currencies, locale),
                                    })}
                                </p>
                            </div>
                        )}
                    </div>

                    <label className="flex flex-col gap-2">
                        <span className="text-h8 uppercase tracking-wide text-grey-1">{t('when')}</span>
                        <span className="relative">
                            <input
                                type="date"
                                value={toDateInputValue(values.date)}
                                onChange={(event) =>
                                    patch({ date: fromDateInputValue(event.target.value, values.date) })
                                }
                                aria-label={t('date')}
                                data-testid="expense-date"
                                data-doodle-date
                                className="input h-14 appearance-none px-4 pr-12"
                            />
                            <Doodle
                                name="iconcalendar"
                                size={21}
                                weight={1.7}
                                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
                            />
                        </span>
                    </label>

                    {submitted && validation && (
                        <p role="alert" className="text-sm font-bold text-error">
                            {validation === 'DESCRIPTION_REQUIRED' && t('validation.DESCRIPTION_REQUIRED')}
                            {validation === 'AMOUNT_REQUIRED' && t('validation.AMOUNT_REQUIRED')}
                            {validation === 'PAYER_REQUIRED' && t('validation.PAYER_REQUIRED')}
                            {validation === 'NO_PARTICIPANTS' && t('validation.NO_PARTICIPANTS')}
                            {validation === 'SHARES_DO_NOT_ADD_UP' && t('validation.SHARES_DO_NOT_ADD_UP')}
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
                            {expense ? t('save') : t('add')}
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
                                {t('delete')}
                            </Button>
                        )}
                    </div>
                </div>
            </DrawerContent>

            {/* The scan overlay writes back into this sheet and creates nothing:
                `onApply` hands over form values and the save button above is still
                the only thing that writes. */}
            {scanFile && (
                <ScanFlow
                    file={scanFile}
                    slug={slug}
                    token={token}
                    members={state.members}
                    roomCurrency={state.room.currency}
                    currencies={currencies}
                    baseValues={values}
                    onCancel={() => setScanFile(null)}
                    onApply={(next) => {
                        setValues(next)
                        // The form is now reconciled by construction, so an error
                        // left over from before the scan is stale by definition.
                        setSubmitted(false)
                        setError(null)
                        setScanFile(null)
                    }}
                />
            )}
        </Drawer>
    )
}
