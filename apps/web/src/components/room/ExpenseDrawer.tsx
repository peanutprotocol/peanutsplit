'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Doodle } from '@/components/ui/Doodle'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody } from '@/components/ui/DrawerLayout'
import { Icon } from '@/components/ui/Icon'
import { isApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { ApiExpense, CurrencyInfo, RoomState } from '@/lib/api-types'
import { roomProps, track } from '@/lib/analytics'
import { dayLabel, fromDateInputValue, toDateInputValue } from '@/lib/dates'
import {
    allocatedMinor,
    buildExpenseBody,
    emptyExpenseForm,
    expenseToFormValues,
    remainingMinor,
    repairMisplacedExpenseFields,
    validateExpenseForm,
    type ExpenseFormValues,
} from '@/lib/expense-form'
import { useErrorMessage } from '@/lib/error-messages'
import { splitV2Enabled } from '@/lib/flags'
import { currencyInfo, formatAmountInput, formatMoney, parseAmountToMinor } from '@/lib/money'
import {
    useAddExpense,
    useDeleteExpense,
    useModelStatus,
    useRestoreExpense,
    useUpdateExpense,
    type ExpenseRequestState,
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
    const tDates = useTranslations('dates')
    const locale = useLocale()
    const errorMessage = useErrorMessage()
    const expenseRequestRef = useRef<ExpenseRequestState | null>(null)
    const addExpense = useAddExpense(slug, token, expenseRequestRef)
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
    const [fieldRepairNotice, setFieldRepairNotice] = useState<string | null>(null)
    const [editor, setEditor] = useState<'payer' | 'split' | 'date' | null>(null)
    const payerNameRef = useRef<HTMLInputElement>(null)
    const amountRef = useRef<HTMLInputElement>(null)
    const descriptionRef = useRef<HTMLInputElement>(null)
    // React does not disable the button until the mutation state renders. A
    // second tap in that gap would mint a second clientKey and create a second
    // expense, so the synchronous guard owns the save attempt.
    const savingRef = useRef(false)
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
        setFieldRepairNotice(null)
        setEditor(null)
        expenseRequestRef.current = null
        setValues(
            expense
                ? expenseToFormValues(expense, currencies, locale)
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
    const validation = validateExpenseForm(values, currencies, locale)
    const remaining = remainingMinor(values, currencies, locale)
    const remainingIsZero = remaining === '0'
    /** The green celebration. Zero left to allocate is NOT enough on its own —
     *  an untouched EXACT form is zero against zero, and cheering before the work
     *  starts spends the moment that was supposed to land at the end of it. */
    const allocationSettled = remainingIsZero && values.exactTouched
    const totalMinor = parseAmountToMinor(values.amountInput, decimals, locale)

    const patch = useCallback((next: Partial<ExpenseFormValues>) => setValues((prev) => ({ ...prev, ...next })), [])

    const choosePayer = (memberId: string) => {
        patch({ paidById: memberId, newPaidByName: '' })
        setAddingPayer(false)
        setNewPayerName('')
        setPayerError(null)
        setEditor(null)
        feedback('tick')
    }

    /**
     * This creates a roster entry, not a new identity for this device. The room
     * link is the credential and writes are trust-based, so the person holding
     * the phone may add Bea and record an expense Bea paid while remaining Ana.
     */
    const createPayer = (event: React.FormEvent) => {
        event.preventDefault()
        const name = newPayerName.trim()
        if (!name) return

        const existing = state.members.find((member) => member.name.toLowerCase() === name.toLowerCase())
        if (existing) {
            choosePayer(existing.id)
            return
        }

        // Draft only. The server creates this member in the same transaction as
        // the expense, so cancelling or a rejected save cannot alter the roster.
        patch({ paidById: '', newPaidByName: name })
        setPayerError(null)
        setAddingPayer(false)
        setNewPayerName('')
        setEditor(null)
        feedback('pop')
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
        const minor = parseAmountToMinor(raw, decimals, locale)
        if (minor === null) return
        editExact(memberId, formatAmountInput(minor, decimals, locale))
    }

    /** Make the interpretation visible before save. A grouped `1,234` in
     * English becomes `1234.00`; in Spanish/Portuguese, `1.234` becomes
     * `1234,00`. If that was not what the person meant, the field now says so
     * while it is still editable. */
    const normaliseAmount = () => {
        const raw = values.amountInput.trim()
        if (raw.length === 0) return
        const minor = parseAmountToMinor(raw, decimals, locale)
        if (minor === null) return
        const normalised = formatAmountInput(minor, decimals, locale)
        if (normalised === raw) return
        patch({ amountInput: normalised })
        setSubmitted(false)
        setFieldRepairNotice(t('amountNormalised', { amount: normalised }))
    }

    const chooseRelativeDate = (daysAgo: number) => {
        const date = new Date()
        date.setDate(date.getDate() - daysAgo)
        patch({ date: fromDateInputValue(toDateInputValue(date.toISOString()), values.date) })
        setEditor(null)
        feedback('tick')
    }

    const putRemainderOn = (memberId: string) => {
        const current = parseAmountToMinor(values.exactInputs[memberId] ?? '', decimals, locale) ?? '0'
        const next = BigInt(current) + BigInt(remaining)
        editExact(memberId, formatAmountInput((next < 0n ? 0n : next).toString(), decimals, locale))
    }

    const close = () => {
        onClose()
    }

    /**
     * Wait until focus leaves a field before moving anything. Swapping on the
     * first numeric character would make the active input jump underneath the
     * person's fingers; blur gives us the complete pair and still repairs it
     * before they can submit. `save()` repeats this check as a keyboard/paste
     * safety net.
     */
    const repairFieldRoles = (candidate: ExpenseFormValues = values, clearSubmitted = true) => {
        const repaired = repairMisplacedExpenseFields(candidate, currencies, locale)
        if (!repaired) return candidate
        setValues(repaired)
        if (clearSubmitted) setSubmitted(false)
        setFieldRepairNotice(t('fieldsSwapped'))
        feedback('tick')
        return repaired
    }

    const save = async () => {
        if (savingRef.current) return
        setSubmitted(true)
        const valuesToSave = repairFieldRoles(values, false)
        const validationToSave = validateExpenseForm(valuesToSave, currencies, locale)
        if (validationToSave) {
            // The message alone is easy to miss on a long form — the sheet moving
            // is what tells you the tap was received and refused.
            feedback('error', { haptic: 'error' })
            shake()
            if (validationToSave === 'AMOUNT_REQUIRED' || validationToSave === 'AMOUNT_INVALID')
                amountRef.current?.focus()
            else if (validationToSave === 'DESCRIPTION_REQUIRED') descriptionRef.current?.focus()
            else if (validationToSave === 'PAYER_REQUIRED') setEditor('payer')
            else setEditor('split')
            return
        }
        savingRef.current = true
        setError(null)
        const body = buildExpenseBody(valuesToSave, currencies, locale)
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
            if (isApiError(err, 'DUPLICATE_MEMBER_NAME') && valuesToSave.newPaidByName) {
                setError(t('payerDuplicate', { name: valuesToSave.newPaidByName }))
                setEditor('payer')
                return
            }
            if (isApiError(err, 'EXPENSE_DELETED')) {
                setError(t('wasDeleted'))
                return
            }
            setError(errorMessage(err, t('saveFailed')))
        } finally {
            savingRef.current = false
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

    const payer = state.members.find((member) => member.id === values.paidById)
    const payerName = values.newPaidByName || payer?.name
    const participantIds =
        values.splitMode === 'EQUAL'
            ? values.participantsTouched
                ? values.participantIds
                : state.members.map((member) => member.id)
            : participantsForExact.map((member) => member.id)
    const participants = state.members.filter((member) => participantIds.includes(member.id))
    const participantSummary =
        participants.length === state.members.length
            ? t('everyone')
            : participants.length === 0
              ? t('choosePeople')
              : participants.length === 1
                ? participants[0].name
                : t('peopleSummary', { name: participants[0].name, count: participants.length - 1 })
    const splitModeSummary = values.splitMode === 'EQUAL' ? t('equally') : t('exactAmounts')
    const dateSummary = dayLabel(values.date, {
        locale,
        today: tDates('today'),
        yesterday: tDates('yesterday'),
    })
    const todayInput = toDateInputValue(new Date().toISOString())
    const yesterdayDate = new Date()
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterdayInput = toDateInputValue(yesterdayDate.toISOString())
    const selectedDateInput = toDateInputValue(values.date)
    const validationCopy =
        validation === 'DESCRIPTION_REQUIRED'
            ? t('validation.DESCRIPTION_REQUIRED')
            : validation === 'AMOUNT_REQUIRED'
              ? t('validation.AMOUNT_REQUIRED')
              : validation === 'AMOUNT_INVALID'
                ? t('validation.AMOUNT_INVALID')
                : validation === 'PAYER_REQUIRED'
                  ? t('validation.PAYER_REQUIRED')
                  : validation === 'NO_PARTICIPANTS'
                    ? t('validation.NO_PARTICIPANTS')
                    : validation === 'SHARE_AMOUNT_INVALID'
                      ? t('validation.SHARE_AMOUNT_INVALID')
                      : validation === 'SHARES_DO_NOT_ADD_UP'
                        ? t('validation.SHARES_DO_NOT_ADD_UP')
                        : null
    const amountInvalid = submitted && (validation === 'AMOUNT_REQUIRED' || validation === 'AMOUNT_INVALID')
    const descriptionInvalid = submitted && validation === 'DESCRIPTION_REQUIRED'
    const positiveTotal = totalMinor !== null && BigInt(totalMinor) > 0n
    const primaryLabel =
        expense || !positiveTotal
            ? expense
                ? t('save')
                : t('add')
            : t('addWithAmount', {
                  amount: formatMoney(totalMinor!, values.currency, currencies, locale),
              })
    const pending = addExpense.isPending || updateExpense.isPending

    return (
        <Drawer open={open} onOpenChange={(next) => !next && close()}>
            <DrawerContent
                data-testid="expense-drawer"
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
                    if (
                        target instanceof Element &&
                        target.closest('[data-testid="scan-flow"], [data-currency-menu]')
                    ) {
                        event.preventDefault()
                    }
                }}
                onEscapeKeyDown={(event) => {
                    if (document.querySelector('[data-currency-menu]')) event.preventDefault()
                }}
            >
                <DrawerHeader className="flex shrink-0 flex-row items-end justify-between px-4 pb-2 pt-0 text-left">
                    <DrawerTitle className="text-h5">{expense ? t('editTitle') : t('addTitle')}</DrawerTitle>
                    <button
                        type="button"
                        onClick={close}
                        aria-label={t('close')}
                        data-testid="close-expense"
                        className="flex size-11 items-center justify-center rounded-full border-2 border-n-1 bg-white transition-transform active:rotate-3"
                    >
                        <Icon name="x" size={21} />
                    </button>
                </DrawerHeader>

                <DrawerBody ref={formRef} className="gap-3 pb-6 pt-2" data-testid="expense-scroll">
                    {/* One object, not four labelled sections: the receipt being created. */}
                    <div
                        data-testid="expense-composer"
                        className={cn(
                            'shadow-4 overflow-hidden rounded-lg border-2 bg-white transition-colors',
                            amountInvalid || descriptionInvalid ? 'border-error' : 'border-n-1'
                        )}
                    >
                        <div className="flex min-w-0 items-center gap-2 px-3 py-2">
                            <label className="min-w-0 flex-1">
                                <span className="sr-only">{t('amount')}</span>
                                <input
                                    ref={amountRef}
                                    value={values.amountInput}
                                    onChange={(event) => {
                                        patch({ amountInput: event.target.value })
                                        setSubmitted(false)
                                        setFieldRepairNotice(null)
                                    }}
                                    onBlur={() => {
                                        repairFieldRoles()
                                        normaliseAmount()
                                    }}
                                    inputMode="decimal"
                                    autoComplete="off"
                                    placeholder={decimals === 0 ? '0' : '0.00'}
                                    aria-invalid={amountInvalid || undefined}
                                    aria-describedby={amountInvalid ? 'expense-amount-error' : undefined}
                                    data-testid="expense-amount"
                                    className="h-16 w-full min-w-0 border-0 bg-transparent px-1 text-h3 font-extrabold tabular-nums outline-none placeholder:text-grey-2"
                                />
                            </label>
                            <div className="w-[7.25rem] shrink-0">
                                <CurrencySelect
                                    value={values.currency}
                                    onChange={(code) => patch({ currency: code })}
                                    currencies={currencies}
                                    suggested={suggestedCurrencies}
                                    variant="sm"
                                    aria-label={t('currency')}
                                    data-testid="expense-currency"
                                />
                            </div>
                        </div>

                        <label className="block border-t border-dashed border-grey-1">
                            <span className="sr-only">{t('description')}</span>
                            <input
                                ref={descriptionRef}
                                value={values.description}
                                onChange={(event) => {
                                    patch({ description: event.target.value })
                                    setSubmitted(false)
                                    setFieldRepairNotice(null)
                                }}
                                onBlur={() => repairFieldRoles()}
                                placeholder={t('descriptionPlaceholder')}
                                maxLength={255}
                                aria-invalid={descriptionInvalid || undefined}
                                aria-describedby={descriptionInvalid ? 'expense-description-error' : undefined}
                                data-testid="expense-description"
                                className="h-14 w-full border-0 bg-transparent px-4 text-sm font-bold outline-none placeholder:text-grey-1"
                            />
                        </label>

                        <div className="grid grid-cols-[1.1fr_1.45fr_.85fr] border-t border-dashed border-grey-1 p-1.5">
                            <button
                                type="button"
                                onClick={() => setEditor((current) => (current === 'payer' ? null : 'payer'))}
                                aria-pressed={editor === 'payer'}
                                aria-label={payerName ? t('paidBySummary', { name: payerName }) : t('paidBy')}
                                data-testid="expense-payer-summary"
                                className={cn(
                                    'flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-sm border-r border-dashed border-grey-2 px-1 text-left',
                                    editor === 'payer' && 'bg-primary-3'
                                )}
                            >
                                {payer && <MemberAvatar name={payer.name} avatar={payer.avatar} size={25} />}
                                <span className="min-w-0">
                                    <span className="block truncate text-h9">{payerName ?? t('choosePayer')}</span>
                                    <span className="block text-h10 text-grey-1">{t('paid')}</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditor((current) => (current === 'split' ? null : 'split'))}
                                aria-pressed={editor === 'split'}
                                aria-label={t('splitSummary', {
                                    people: participantSummary,
                                    mode: splitModeSummary,
                                })}
                                data-testid="expense-split-summary"
                                className={cn(
                                    'flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-sm border-r border-dashed border-grey-2 px-1 text-left',
                                    editor === 'split' && 'bg-primary-3'
                                )}
                            >
                                <span className="flex shrink-0 pl-1.5">
                                    {participants.slice(0, 3).map((member, index) => (
                                        <MemberAvatar
                                            key={member.id}
                                            name={member.name}
                                            avatar={member.avatar}
                                            size={23}
                                            className={index > 0 ? '-ml-2' : ''}
                                        />
                                    ))}
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-h9">{participantSummary}</span>
                                    <span className="block truncate text-h10 text-grey-1">{splitModeSummary}</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditor((current) => (current === 'date' ? null : 'date'))}
                                aria-pressed={editor === 'date'}
                                aria-label={t('dateSummary', { date: dateSummary })}
                                data-testid="expense-date-summary"
                                className={cn(
                                    'flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-sm px-1',
                                    editor === 'date' && 'bg-primary-3'
                                )}
                            >
                                <Doodle name="iconcalendar" size={19} weight={1.8} className="shrink-0" />
                                <span className="min-w-0">
                                    <span className="block truncate text-h9">{dateSummary}</span>
                                    <span className="block text-h10 text-grey-1">{t('dateShort')}</span>
                                </span>
                            </button>
                        </div>
                    </div>

                    <AnimatePresence initial={false}>
                        {fieldRepairNotice && (
                            <motion.p
                                key={fieldRepairNotice}
                                role="status"
                                aria-live="polite"
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                className="px-1 text-xs font-bold text-grey-1"
                                data-testid="expense-fields-repaired"
                            >
                                {fieldRepairNotice}
                            </motion.p>
                        )}
                    </AnimatePresence>

                    {amountInvalid && (
                        <p
                            id="expense-amount-error"
                            role="alert"
                            className="flex items-center gap-2 text-sm font-bold text-error"
                        >
                            <Icon name="x" size={16} />
                            {validationCopy ?? t('validation.AMOUNT_REQUIRED')}
                        </p>
                    )}
                    {descriptionInvalid && (
                        <p
                            id="expense-description-error"
                            role="alert"
                            className="flex items-center gap-2 text-sm font-bold text-error"
                        >
                            <Icon name="x" size={16} />
                            {t('validation.DESCRIPTION_REQUIRED')}
                        </p>
                    )}

                    {/* Right under the composer, and only when adding: quick add
                        rewrites the receipt and its split. It remains progressive
                        enhancement; the card never depends on the model probe. */}
                    {!expense && !modelResolved && (
                        <div
                            data-testid="expense-tools-loading"
                            aria-hidden="true"
                            className="flex flex-wrap items-start gap-2"
                        >
                            {splitV2Enabled() && (
                                <span className="min-h-11 w-32 animate-pulse rounded-sm border border-dashed border-grey-1 bg-grey-4 opacity-50" />
                            )}
                            <span className="min-h-11 w-28 animate-pulse rounded-sm border border-dashed border-grey-1 bg-grey-4 opacity-50" />
                        </div>
                    )}
                    {!expense && modelResolved && modelEnabled && (
                        <div className="flex flex-wrap items-start gap-2">
                            <ScanButton onFile={setScanFile} />
                            <QuickAdd
                                slug={slug}
                                roomCurrency={state.room.currency}
                                currencies={currencies}
                                values={values}
                                onApply={(next) => {
                                    setValues(next)
                                    setSubmitted(false)
                                    setError(null)
                                    setEditor(null)
                                }}
                            />
                        </div>
                    )}

                    {isForeign && (
                        <div
                            data-testid="expense-foreign-note"
                            className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-n-1 bg-primary-3 px-3 py-2 text-sm"
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

                    {editor === 'payer' && (
                        <section
                            data-testid="payer-editor"
                            aria-label={t('whoPaid')}
                            className="shadow-4 overflow-hidden rounded-lg border-2 border-n-1 bg-white"
                        >
                            <div className="flex items-center justify-between gap-3 border-b border-dashed border-grey-1 px-3 py-2">
                                <div>
                                    <h3 className="text-h8">{t('whoPaid')}</h3>
                                    <p className="mt-1 text-xs text-grey-1">{t('whoPaidHint')}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEditor(null)}
                                    aria-label={t('collapseSection')}
                                    data-testid="collapse-payer-editor"
                                    className="flex size-11 shrink-0 items-center justify-center bg-transparent transition-transform hover:-translate-y-0.5 active:translate-y-[1px]"
                                >
                                    <Icon name="chevron-up" size={24} />
                                </button>
                            </div>
                            <div className="flex flex-col gap-2 p-3">
                                <div role="radiogroup" aria-label={t('paidBy')} className="grid grid-cols-2 gap-2">
                                    {values.newPaidByName && (
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked="true"
                                            data-testid="payer-chip"
                                            data-member={values.newPaidByName}
                                            className="shadow-2 flex min-h-12 min-w-0 items-center gap-2 rounded-md border border-n-1 bg-primary-3 px-2 text-left"
                                        >
                                            <MemberAvatar name={values.newPaidByName} avatar={null} size={27} />
                                            <span className="flex-1 truncate text-h8">{values.newPaidByName}</span>
                                            <Icon name="check" size={16} />
                                        </button>
                                    )}
                                    {state.members.map((member) => {
                                        const selected = values.paidById === member.id
                                        return (
                                            <button
                                                key={member.id}
                                                type="button"
                                                role="radio"
                                                aria-checked={selected}
                                                onClick={() => choosePayer(member.id)}
                                                data-testid="payer-chip"
                                                data-member={member.name}
                                                className={cn(
                                                    'flex min-h-12 min-w-0 items-center gap-2 rounded-md border border-n-1 px-2 text-left transition-all',
                                                    selected ? 'shadow-2 bg-primary-3' : 'bg-white'
                                                )}
                                            >
                                                <MemberAvatar name={member.name} avatar={member.avatar} size={27} />
                                                <span className="flex-1 truncate text-h8">{member.name}</span>
                                                {selected && <Icon name="check" size={16} />}
                                            </button>
                                        )
                                    })}
                                </div>

                                {!expense && !addingPayer && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAddingPayer(true)
                                            setPayerError(null)
                                            requestAnimationFrame(() => payerNameRef.current?.focus())
                                        }}
                                        className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-dashed border-n-1 bg-white px-3 py-2 text-h8"
                                        data-testid="add-payer"
                                    >
                                        <Icon name="plus" size={18} />
                                        {t('addPayer')}
                                    </button>
                                )}

                                {!expense && addingPayer && (
                                    <form onSubmit={createPayer} className="flex items-center gap-2">
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
                                        <button
                                            type="submit"
                                            disabled={!newPayerName.trim()}
                                            aria-label={t('confirmPayer')}
                                            data-testid="add-payer-submit"
                                            className="shadow-2 flex size-12 shrink-0 items-center justify-center rounded-md border border-n-1 bg-primary-1 disabled:opacity-50"
                                        >
                                            <Icon name="check" size={19} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={t('cancelPayer')}
                                            onClick={() => {
                                                setAddingPayer(false)
                                                setNewPayerName('')
                                                setPayerError(null)
                                            }}
                                            className="flex size-12 shrink-0 items-center justify-center rounded-md border border-n-1 bg-white"
                                        >
                                            <Icon name="x" size={19} />
                                        </button>
                                    </form>
                                )}

                                {payerError && (
                                    <p role="alert" className="text-sm font-bold text-error">
                                        {payerError}
                                    </p>
                                )}
                            </div>
                        </section>
                    )}

                    {editor === 'split' && (
                        <section
                            data-testid="split-editor"
                            aria-label={t('whoShares')}
                            className="shadow-4 overflow-hidden rounded-lg border-2 border-n-1 bg-white"
                        >
                            <div className="flex items-center justify-between gap-3 border-b border-dashed border-grey-1 px-3 py-2">
                                <div>
                                    <h3 className="text-h8">{t('whoShares')}</h3>
                                    <p className="mt-1 text-xs text-grey-1">
                                        {values.splitMode === 'EQUAL' ? t('equallyHint') : t('exactAmountsHint')}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEditor(null)}
                                    aria-label={t('collapseSection')}
                                    data-testid="collapse-split-editor"
                                    className="flex size-11 shrink-0 items-center justify-center bg-transparent transition-transform hover:-translate-y-0.5 active:translate-y-[1px]"
                                >
                                    <Icon name="chevron-up" size={24} />
                                </button>
                            </div>
                            <div className="flex flex-col gap-3 p-3">
                                <div className="grid grid-cols-2 rounded-full border border-n-1 bg-white p-1">
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
                                                'min-h-10 rounded-full px-3 py-2 text-h9 transition-colors duration-150',
                                                values.splitMode === mode ? 'bg-n-1 text-white' : 'bg-white text-n-1'
                                            )}
                                        >
                                            {mode === 'EQUAL' ? t('equally') : t('exactAmounts')}
                                        </button>
                                    ))}
                                </div>

                                {values.splitMode === 'EQUAL' ? (
                                    <ul aria-label={t('whoShares')} className="grid grid-cols-2 gap-2">
                                        {state.members.map((member) => {
                                            const checked =
                                                !values.participantsTouched || values.participantIds.includes(member.id)
                                            return (
                                                <li key={member.id}>
                                                    <button
                                                        type="button"
                                                        role="checkbox"
                                                        aria-checked={checked}
                                                        onClick={() => {
                                                            toggleParticipant(member.id)
                                                            feedback('tick')
                                                        }}
                                                        data-testid="participant-toggle"
                                                        data-member={member.name}
                                                        className={cn(
                                                            'flex min-h-12 w-full min-w-0 items-center gap-2 rounded-md border border-n-1 px-2 text-left transition-all',
                                                            checked ? 'bg-white' : 'bg-grey-4 opacity-60'
                                                        )}
                                                    >
                                                        <MemberAvatar
                                                            name={member.name}
                                                            avatar={member.avatar}
                                                            size={27}
                                                        />
                                                        <span className="flex-1 truncate text-h8">{member.name}</span>
                                                        <span
                                                            className={cn(
                                                                'flex size-6 shrink-0 items-center justify-center rounded-full border border-n-1',
                                                                checked ? 'bg-green-1' : 'bg-white'
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
                                                                        <Icon name="check" size={15} />
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
                                                <li
                                                    key={member.id}
                                                    className="flex items-center gap-2 rounded-md border border-n-1 bg-white p-2"
                                                >
                                                    <MemberAvatar name={member.name} avatar={member.avatar} size={28} />
                                                    <span className="w-20 shrink-0 truncate text-h8">
                                                        {member.name}
                                                    </span>
                                                    <input
                                                        value={values.exactInputs[member.id] ?? ''}
                                                        onChange={(event) => editExact(member.id, event.target.value)}
                                                        onFocus={(event) => event.target.select()}
                                                        onBlur={() => normaliseExact(member.id)}
                                                        inputMode="decimal"
                                                        aria-label={t('exactAmountFor', {
                                                            name: member.name,
                                                        })}
                                                        data-testid="exact-input"
                                                        data-member={member.name}
                                                        className="input h-12 min-w-0 flex-1 px-3 text-base tabular-nums"
                                                    />
                                                    {!remainingIsZero && (
                                                        <button
                                                            type="button"
                                                            onClick={() => putRemainderOn(member.id)}
                                                            aria-label={t('putRemainderOn', {
                                                                name: member.name,
                                                            })}
                                                            data-testid="put-remainder"
                                                            data-member={member.name}
                                                            className="flex h-12 shrink-0 items-center justify-center rounded-sm border border-dashed border-n-1 bg-white px-2 text-h9 tabular-nums"
                                                        >
                                                            {remaining.startsWith('-') ? '−' : '+'}
                                                            {formatAmountInput(
                                                                remaining.replace('-', ''),
                                                                decimals,
                                                                locale
                                                            )}
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
                                                                exactInputs: {
                                                                    ...values.exactInputs,
                                                                    [member.id]: '',
                                                                },
                                                            })
                                                        }
                                                        className="rounded-sm border border-dashed border-n-1 px-3 py-2 text-h9"
                                                    >
                                                        {t('addToSplit', { name: member.name })}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        <motion.div
                                            data-testid="remaining-readout"
                                            role="status"
                                            aria-live="polite"
                                            animate={allocationSettled ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                                            transition={{ duration: 0.3, ease: 'easeOut' }}
                                            className={cn(
                                                'flex items-center justify-between rounded-md border border-n-1 px-3 py-3 text-h8 transition-colors duration-200',
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
                                        <p className="text-sm text-grey-1">
                                            {t('amountsAreIn', { currency: values.currency })}
                                            {values.currency !== state.room.currency &&
                                                t('convertedAt', {
                                                    roomCurrency: state.room.currency,
                                                })}
                                            {t('allocatedOf', {
                                                allocated: formatMoney(
                                                    allocatedMinor(values, currencies, locale),
                                                    values.currency,
                                                    currencies,
                                                    locale
                                                ),
                                                total: formatMoney(
                                                    totalMinor ?? '0',
                                                    values.currency,
                                                    currencies,
                                                    locale
                                                ),
                                            })}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {editor === 'date' && (
                        <section
                            data-testid="date-editor"
                            aria-label={t('date')}
                            className="shadow-4 overflow-hidden rounded-lg border-2 border-n-1 bg-white"
                        >
                            <div className="flex items-center justify-between gap-3 border-b border-dashed border-grey-1 px-3 py-2">
                                <div>
                                    <h3 className="text-h8">{t('whenWasIt')}</h3>
                                    <p className="mt-1 text-xs text-grey-1">{dateSummary}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEditor(null)}
                                    aria-label={t('collapseSection')}
                                    data-testid="collapse-date-editor"
                                    className="flex size-11 shrink-0 items-center justify-center bg-transparent transition-transform hover:-translate-y-0.5 active:translate-y-[1px]"
                                >
                                    <Icon name="chevron-up" size={24} />
                                </button>
                            </div>
                            <div className="flex flex-col gap-2 p-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => chooseRelativeDate(0)}
                                        aria-pressed={selectedDateInput === todayInput}
                                        className={cn(
                                            'min-h-11 rounded-md border border-n-1 text-h8',
                                            selectedDateInput === todayInput ? 'shadow-2 bg-primary-3' : 'bg-white'
                                        )}
                                    >
                                        {tDates('today')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => chooseRelativeDate(1)}
                                        aria-pressed={selectedDateInput === yesterdayInput}
                                        className={cn(
                                            'min-h-11 rounded-md border border-n-1 text-h8',
                                            selectedDateInput === yesterdayInput ? 'shadow-2 bg-primary-3' : 'bg-white'
                                        )}
                                    >
                                        {tDates('yesterday')}
                                    </button>
                                </div>
                                <label className="relative">
                                    <span className="sr-only">{t('date')}</span>
                                    <input
                                        type="date"
                                        value={selectedDateInput}
                                        onChange={(event) => {
                                            patch({
                                                date: fromDateInputValue(event.target.value, values.date),
                                            })
                                            setEditor(null)
                                        }}
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
                                </label>
                            </div>
                        </section>
                    )}

                    {submitted && validationCopy && !amountInvalid && !descriptionInvalid && (
                        <p role="alert" className="flex items-center gap-2 text-sm font-bold text-error">
                            <Icon name="x" size={16} />
                            {validationCopy}
                        </p>
                    )}

                    {error && (
                        <p role="alert" className="text-sm font-bold text-error">
                            {error}
                        </p>
                    )}
                </DrawerBody>

                <DrawerActions className="border-t border-n-1 bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
                    <Button
                        variant="primary"
                        shadowSize="4"
                        onClick={save}
                        loading={pending}
                        className="justify-center text-h6"
                        data-testid="save-expense"
                    >
                        {primaryLabel}
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
                </DrawerActions>
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
