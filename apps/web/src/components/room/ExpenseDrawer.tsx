'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody } from '@/components/ui/DrawerLayout'
import { Icon } from '@/components/ui/Icon'
import { isApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { ApiExpense, CurrencyInfo, ExpenseUpdateInput, RoomState, SplitMode } from '@/lib/api-types'
import { roomProps, track, trackFirstSharedBalance } from '@/lib/analytics'
import { dayLabel, fromDateInputValue, toDateInputValue } from '@/lib/dates'
import {
    allocatedMinor,
    buildExpenseBody,
    emptyExpenseForm,
    exactParticipantIds,
    expenseToFormValues,
    hasUnreadablePercentage,
    hasUnreadableShare,
    MAX_SPLIT_WEIGHT,
    percentageRemainingBasisPoints,
    remainingMinor,
    repairMisplacedExpenseFields,
    shareWeightEntries,
    validateExpenseForm,
    weightedParticipantIds,
    type ExpenseFormValues,
} from '@/lib/expense-form'
import { useErrorMessage } from '@/lib/error-messages'
import { splitV2Enabled } from '@/lib/flags'
import { discardSharedReceipt, takeSharedReceipt } from '@/lib/shared-receipt'
import { currencyInfo, formatAmountInput, formatMoney, isAmountInputAcceptable, parseAmountToMinor } from '@/lib/money'
import {
    useAddExpense,
    useAddMember,
    useDeleteExpense,
    useModelStatus,
    useRestoreExpense,
    useUpdateExpense,
    type ExpenseRequestState,
} from '@/lib/queries'
import { TOAST_MS } from '@/lib/toasts'
import { useCurrencyHints } from '@/lib/use-currency-hint'
import { convertMinorForPreview, useRate } from '@/lib/use-rate'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'
import { useShake } from '@/hooks/useShake'
import { CurrencySelect } from './CurrencySelect'
import { CurrencyTag } from './CurrencyTag'
import { MemberAvatar } from './MemberAvatar'
import { Money } from './Money'
import { QuickAdd } from './QuickAdd'
import { ExpenseComposer } from './expense-drawer/ExpenseComposer'
import { ExpenseDateEditor } from './expense-drawer/ExpenseDateEditor'
import { ExpenseDrawerActions } from './expense-drawer/ExpenseDrawerActions'
import { expenseDrawerWorkflowReducer, initialExpenseDrawerWorkflowState } from './expense-drawer/workflow-state'
import { ScanButton } from './scan/ScanButton'
import { ScanFlow } from './scan/ScanFlow'

interface ExpenseDrawerProps {
    open: boolean
    onClose: () => void
    slug: string
    state: RoomState
    currencies: readonly CurrencyInfo[]
    token?: string | null
    /** The member represented by this device, for first-person filing metadata. */
    meId?: string
    /** Null = add mode. */
    expense: ApiExpense | null
    /** The first actionable balance can hand straight to the existing, dismissible
     *  Share drawer. Ordinary saves still close back to the room. */
    onFirstSharedBalance?: () => void
    defaultPaidById: string
    /** `?shared=1` — a photo the OS share sheet parked for this room. */
    sharedReceipt?: boolean
    onSharedReceiptConsumed?: () => void
}

const ADVANCED_SPLIT_MODES = ['EXACT', 'PERCENTAGE', 'SHARES'] as const
const ALL_SPLIT_MODES = ['EQUAL', ...ADVANCED_SPLIT_MODES] as const

export function ExpenseDrawer({
    open,
    onClose,
    slug,
    state,
    currencies,
    token,
    meId,
    expense,
    onFirstSharedBalance,
    defaultPaidById,
    sharedReceipt = false,
    onSharedReceiptConsumed,
}: ExpenseDrawerProps) {
    const t = useTranslations('room.expenseDrawer')
    const tExpenses = useTranslations('room.expenses')
    const tDates = useTranslations('dates')
    const locale = useLocale()
    const errorMessage = useErrorMessage()
    const expenseRequestRef = useRef<ExpenseRequestState | null>(null)
    const addExpense = useAddExpense(slug, token, expenseRequestRef)
    const updateExpense = useUpdateExpense(slug, token)
    const deleteExpense = useDeleteExpense(slug, token)
    const restoreExpense = useRestoreExpense(slug, token)
    /** Adding a participant is a real roster write (`intent: 'add'`), unlike the
     *  payer field, whose new name stays a draft until the expense commits. */
    const addMember = useAddMember(slug, token)
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()
    const { ref: formRef, shake } = useShake<HTMLDivElement>()
    const hints = useCurrencyHints()

    const [values, setValues] = useState<ExpenseFormValues>(() =>
        emptyExpenseForm({ currency: state.room.currency, members: state.members, paidById: defaultPaidById })
    )
    const [workflow, dispatchWorkflow] = useReducer(
        expenseDrawerWorkflowReducer,
        undefined,
        initialExpenseDrawerWorkflowState
    )
    const {
        submitted,
        error,
        scanFile,
        payerDraft: { open: addingPayer, name: newPayerName, error: payerError },
        participantDraft: { open: addingParticipant, name: newParticipantName, error: participantError },
        fieldRepairNotice,
        editor,
        advancedOptionsOpen: moreSplitOptionsOpen,
        confirmingDelete,
    } = workflow
    const deleteTriggerRef = useRef<HTMLButtonElement>(null)
    const payerNameRef = useRef<HTMLInputElement>(null)
    const participantNameRef = useRef<HTMLInputElement>(null)
    const amountRef = useRef<HTMLInputElement>(null)
    const validationAlertRef = useRef<HTMLParagraphElement>(null)
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
        // One transition owns all ephemeral reset behavior, including clearing
        // a half-finished scan so reopening cannot show somebody else's receipt.
        dispatchWorkflow({
            type: 'reset-on-open',
            advancedOptionsOpen: Boolean(expense && expense.splitMode !== 'EQUAL'),
        })
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

    /**
     * A receipt shared in from the OS, picked up once.
     *
     * Declared AFTER the re-seed effect on purpose: that one clears `scanFile` on every open and
     * effects run in declaration order, so swapping the two would wipe the photo the drawer is
     * opening to receive. Its deps are `[open, expense?.id]`, so it does not re-run when `shared`
     * flips — which is why this placement is enough.
     *
     * Fires on the param rather than on the drawer, because the drawer is not always reachable.
     * A room can be in `ps:recent` and still need a join (recent-rooms is written on every visit
     * and carries no identity), and RoomScreen gates the whole drawer on that. A photo parked for
     * a screen that is not coming has to be thrown away, not left waiting.
     *
     * The model probe is the second gate. This is a SECOND entry point into the scan flow — the
     * one ROADMAP's "V1 hold — receipt scanning" holds behind a real-device pass — and it reaches
     * ScanFlow without passing ScanButton, which is what the probe normally hides. A v2 build with
     * no model key answers 503, so the share sheet would take the photo, open the overlay and then
     * fail.
     */
    useEffect(() => {
        if (!sharedReceipt) return

        const drop = () => {
            void discardSharedReceipt(caches)
            onSharedReceiptConsumed?.()
        }
        // Unjoined room, or a room whose state never loaded. Do not leave a receipt photo parked,
        // and do not leave `shared=1` in a URL somebody may go on to share.
        if (!open || !splitV2Enabled()) {
            drop()
            return
        }
        // Still asking the server whether it can read a bill. Wait rather than guess.
        if (!modelResolved) return
        if (!modelEnabled) {
            drop()
            return
        }

        let cancelled = false
        void takeSharedReceipt(caches).then((file) => {
            if (!cancelled && file) dispatchWorkflow({ type: 'scan-selected', file })
            onSharedReceiptConsumed?.()
        })
        return () => {
            cancelled = true
        }
    }, [open, sharedReceipt, modelResolved, modelEnabled, onSharedReceiptConsumed])

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
     *  starts spends the moment that was supposed to land at the end of it. A
     *  share the parser cannot read counts as zero in `remaining`, so it has to be
     *  ruled out here too: the readout must never go green over a value that save
     *  will refuse. */
    const allocationSettled = remainingIsZero && values.exactTouched && !hasUnreadableShare(values, currencies, locale)
    const percentageRemaining = percentageRemainingBasisPoints(values, locale)
    const percentageHasInput = Object.values(values.percentageInputs).some((input) => input.trim().length > 0)
    const percentageSettled =
        percentageRemaining === '0' && percentageHasInput && !hasUnreadablePercentage(values, locale)
    const totalMinor = parseAmountToMinor(values.amountInput, decimals, locale)

    const patch = useCallback((next: Partial<ExpenseFormValues>) => setValues((prev) => ({ ...prev, ...next })), [])

    const choosePayer = (memberId: string) => {
        patch({ paidById: memberId, newPaidByName: '' })
        dispatchWorkflow({ type: 'payer-committed' })
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
        dispatchWorkflow({ type: 'payer-committed' })
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
    const setSplitMode = (mode: SplitMode) => {
        if (mode === values.splitMode) return
        if (mode === 'EQUAL') {
            patch({ splitMode: 'EQUAL' })
            return
        }
        const participants = values.participantsTouched ? values.participantIds : state.members.map((m) => m.id)
        if (mode === 'EXACT') {
            if (Object.keys(values.exactInputs).length > 0) {
                patch({ splitMode: mode })
                return
            }
            const exactInputs: Record<string, string> = {}
            for (const memberId of participants) exactInputs[memberId] = ''
            patch({ splitMode: mode, exactInputs, exactTouched: false })
            return
        }
        if (mode === 'PERCENTAGE') {
            if (Object.keys(values.percentageInputs).length > 0) {
                patch({ splitMode: mode })
                return
            }
            const percentageInputs: Record<string, string> = {}
            for (const memberId of participants) percentageInputs[memberId] = ''
            patch({ splitMode: mode, percentageInputs })
            return
        }
        if (Object.keys(values.shareInputs).length > 0) {
            patch({ splitMode: mode })
            return
        }
        const shareInputs: Record<string, string> = {}
        for (const memberId of participants) shareInputs[memberId] = ''
        patch({ splitMode: mode, shareInputs })
    }

    /** The split methods expose radio semantics, including the arrow-key
     *  behavior native radios provide. Moving to a hidden advanced option also
     *  opens the disclosure before focus follows the selection. */
    const moveSplitMode = (event: React.KeyboardEvent<HTMLButtonElement>, mode: SplitMode) => {
        const key = event.key
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return
        event.preventDefault()

        const current = ALL_SPLIT_MODES.indexOf(mode)
        const nextIndex =
            key === 'Home'
                ? 0
                : key === 'End'
                  ? ALL_SPLIT_MODES.length - 1
                  : key === 'ArrowLeft' || key === 'ArrowUp'
                    ? (current - 1 + ALL_SPLIT_MODES.length) % ALL_SPLIT_MODES.length
                    : (current + 1) % ALL_SPLIT_MODES.length
        const next = ALL_SPLIT_MODES[nextIndex]
        if (next !== 'EQUAL') dispatchWorkflow({ type: 'advanced-options-opened' })
        setSplitMode(next)
        feedback('tick')
        requestAnimationFrame(() => {
            document.querySelector<HTMLButtonElement>(`[data-testid="split-${next.toLowerCase()}"]`)?.focus()
        })
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

    /**
     * Add a missing person without making someone abandon the expense they are
     * already composing. The new roster row joins this split immediately:
     * selected in EQUAL, and present with a blank amount ready to type in EXACT.
     */
    const createParticipant = async (event: React.FormEvent) => {
        event.preventDefault()
        const name = newParticipantName.trim()
        if (!name || addMember.isPending) return

        const select = (memberId: string) => {
            if (values.splitMode === 'EQUAL') {
                const current = values.participantsTouched
                    ? values.participantIds
                    : state.members.map((member) => member.id)
                patch({
                    participantsTouched: true,
                    participantIds: current.includes(memberId) ? current : [...current, memberId],
                })
            } else if (values.splitMode === 'EXACT' && values.exactInputs[memberId] === undefined) {
                patch({ exactInputs: { ...values.exactInputs, [memberId]: '' } })
            } else if (values.splitMode === 'PERCENTAGE' && values.percentageInputs[memberId] === undefined) {
                patch({ percentageInputs: { ...values.percentageInputs, [memberId]: '' } })
            } else if (values.splitMode === 'SHARES' && values.shareInputs[memberId] === undefined) {
                patch({ shareInputs: { ...values.shareInputs, [memberId]: '' } })
            }
            dispatchWorkflow({ type: 'participant-draft-closed' })
        }

        const existing = state.members.find((member) => member.name.toLowerCase() === name.toLowerCase())
        if (existing) {
            select(existing.id)
            feedback('tick')
            return
        }

        dispatchWorkflow({ type: 'participant-error-cleared' })
        try {
            const next = await addMember.mutateAsync({ name })
            select(next.memberId)
            feedback('pop')
        } catch (err) {
            feedback('error', { haptic: 'error' })
            if (isApiError(err, 'DUPLICATE_MEMBER_NAME')) {
                dispatchWorkflow({ type: 'participant-failed', error: t('payerDuplicate', { name }) })
                return
            }
            dispatchWorkflow({ type: 'participant-failed', error: errorMessage(err, t('payerAddFailed')) })
        }
    }

    /** Every write into an EXACT field goes through here, so `exactTouched` cannot
     *  be set in one path and forgotten in another. */
    const editExact = (memberId: string, input: string) =>
        patch({ exactInputs: { ...values.exactInputs, [memberId]: input }, exactTouched: true })

    /**
     * A keystroke the amount parser could never read is dropped rather than
     * stored. Unlike the total above — which keeps "taxi" so `repairFieldRoles`
     * can spot a swapped pair and validation can say what is wrong — a share has
     * nowhere to put a word, and holding one desynchronises the readout under
     * it from the save button: `allocatedMinor` counts anything it cannot parse
     * as zero, so a field of letters beside shares that already sum to the total
     * left the sheet cheering "every cent allocated" while saving refused with
     * SHARE_AMOUNT_INVALID.
     */
    const typeExact = (memberId: string, input: string) => {
        if (!isAmountInputAcceptable(input, decimals, locale)) return
        editExact(memberId, input)
    }

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

    const typePercentage = (memberId: string, input: string) => {
        if (!isAmountInputAcceptable(input, 2, locale)) return
        const weight = parseAmountToMinor(input, 2, locale)
        if (weight !== null && BigInt(weight) > MAX_SPLIT_WEIGHT) return
        patch({ percentageInputs: { ...values.percentageInputs, [memberId]: input } })
    }

    const normalisePercentage = (memberId: string) => {
        const raw = values.percentageInputs[memberId] ?? ''
        if (raw.trim().length === 0) return
        const basisPoints = parseAmountToMinor(raw, 2, locale)
        if (basisPoints === null) return
        patch({
            percentageInputs: {
                ...values.percentageInputs,
                [memberId]: formatAmountInput(basisPoints, 2, locale),
            },
        })
    }

    const typeShares = (memberId: string, input: string) => {
        if (!/^\d*$/.test(input)) return
        if (input && BigInt(input) > MAX_SPLIT_WEIGHT) return
        patch({ shareInputs: { ...values.shareInputs, [memberId]: input } })
    }

    const normaliseShares = (memberId: string) => {
        const raw = values.shareInputs[memberId]?.trim() ?? ''
        if (!raw) return
        patch({ shareInputs: { ...values.shareInputs, [memberId]: BigInt(raw).toString() } })
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
        dispatchWorkflow({ type: 'amount-normalised', notice: t('amountNormalised', { amount: normalised }) })
    }

    const chooseRelativeDate = (daysAgo: number) => {
        const date = new Date()
        date.setDate(date.getDate() - daysAgo)
        patch({ date: fromDateInputValue(toDateInputValue(date.toISOString()), values.date) })
        dispatchWorkflow({ type: 'editor-closed' })
        feedback('tick')
    }

    /** What this person currently holds, in expense-currency minor units. Blank
     *  and unreadable both read as zero — neither is money they are down for. */
    const shareMinor = (memberId: string) =>
        parseAmountToMinor(values.exactInputs[memberId] ?? '', decimals, locale) ?? '0'

    /**
     * Would tapping this person's chip actually settle the split?
     *
     * Adding always can. Taking away only goes as far as the share they hold, and
     * the chip used to offer "−15.00" to somebody holding 5.00: the tap clamped
     * at zero and left the split over by the difference, so the chip named an
     * amount it could not deliver. Rather than print a smaller number — which
     * still leaves the split unsettled and now reads as a step towards nothing —
     * the chip stays away from the people who cannot absorb the overage, and the
     * number it does show is the one the tap produces.
     */
    const canTakeRemainder = (memberId: string) => {
        if (remainingIsZero) return false
        if (!remaining.startsWith('-')) return true
        return BigInt(shareMinor(memberId)) + BigInt(remaining) >= 0n
    }

    const putRemainderOn = (memberId: string) => {
        const next = BigInt(shareMinor(memberId)) + BigInt(remaining)
        editExact(memberId, formatAmountInput(next.toString(), decimals, locale))
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
        dispatchWorkflow({ type: 'fields-repaired', notice: t('fieldsSwapped'), clearSubmitted })
        feedback('tick')
        return repaired
    }

    const save = async () => {
        if (savingRef.current) return
        dispatchWorkflow({ type: 'submission-attempted' })
        const valuesToSave = repairFieldRoles(values, false)
        const validationToSave = validateExpenseForm(valuesToSave, currencies, locale)
        if (validationToSave) {
            // The message alone is easy to miss on a long form — the sheet moving
            // is what tells you the tap was received and refused.
            feedback('error', { haptic: 'error' })
            shake()
            if (
                validationToSave === 'AMOUNT_REQUIRED' ||
                validationToSave === 'AMOUNT_INVALID' ||
                validationToSave === 'AMOUNT_NEGATIVE'
            ) {
                amountRef.current?.focus()
            } else {
                dispatchWorkflow({
                    type: 'editor-opened',
                    editor: validationToSave === 'PAYER_REQUIRED' ? 'payer' : 'split',
                })
                /**
                 * The reason renders under a section this tap just opened, which on a
                 * phone puts it a screen and a half below the fold: the sheet shook,
                 * nothing moved, and the refusal was somewhere the person never looked.
                 * A frame lets that section lay out, then the message comes to the eye
                 * and to the screen reader's cursor. Focusing the amount field already
                 * does both for the branch above.
                 */
                requestAnimationFrame(() => {
                    // Focus first, but let the scroll below choose where it lands:
                    // focus on its own settles for "nearest", which parks the reason
                    // against the bottom edge under the action bar.
                    validationAlertRef.current?.focus({ preventScroll: true })
                    validationAlertRef.current?.scrollIntoView({ block: 'center' })
                })
            }
            return
        }
        savingRef.current = true
        dispatchWorkflow({ type: 'error-cleared' })
        const body = buildExpenseBody(valuesToSave, currencies, locale)
        try {
            if (expense) {
                const input: ExpenseUpdateInput = { ...body, expectedSplitMode: expense.splitMode }
                await updateExpense.mutateAsync({ id: expense.id, input })
                track(
                    'expense_edited',
                    roomProps(slug, { splitMode: body.splitMode, foreign: body.currency !== state.room.currency })
                )
            } else {
                const { createdFirstSharedBalance } = await addExpense.mutateAsync(body)
                track(
                    'expense_added',
                    roomProps(slug, { splitMode: body.splitMode, foreign: body.currency !== state.room.currency })
                )
                if (createdFirstSharedBalance) trackFirstSharedBalance()

                // Save succeeded and the room has reached its first actionable
                // balance. The existing Share drawer is itself skippable, so the
                // callback changes the next moment without inventing a blocking
                // onboarding step. If this surface has no handoff owner, close as
                // an ordinary expense save.
                if (createdFirstSharedBalance && onFirstSharedBalance) {
                    feedback('tick', { haptic: 'confirm' })
                    onFirstSharedBalance()
                    return
                }
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
                dispatchWorkflow({
                    type: 'error-set',
                    error: t('payerDuplicate', { name: valuesToSave.newPaidByName }),
                })
                dispatchWorkflow({ type: 'editor-opened', editor: 'payer' })
                return
            }
            if (isApiError(err, 'EXPENSE_DELETED')) {
                dispatchWorkflow({ type: 'error-set', error: t('wasDeleted') })
                return
            }
            dispatchWorkflow({ type: 'error-set', error: errorMessage(err, t('saveFailed')) })
        } finally {
            savingRef.current = false
        }
    }

    const remove = async (): Promise<boolean> => {
        if (!expense) return false
        const id = expense.id
        // The toast quotes the row that just left the list, so it can only quote a
        // real name. Quoting the day fallback made "“Today” deleted", which reads
        // like somebody had called the expense that; an unnamed row gets the
        // sentence with no quotation instead.
        const description = expense.description.trim()
        try {
            await deleteExpense.mutateAsync(id)
            close()
            track('expense_deleted', roomProps(slug))
            // The toast IS the undo window — it has to outlive "wait, did I mean
            // to do that?", which is why it takes the actionable duration.
            toast(description ? t('deletedToast', { description }) : t('deletedToastUnnamed'), {
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
            return true
        } catch (err) {
            feedback('error', { haptic: 'error' })
            dispatchWorkflow({ type: 'error-set', error: errorMessage(err, t('deleteFailed')) })
            return false
        }
    }

    const cancelDelete = () => {
        dispatchWorkflow({ type: 'delete-confirmation-cancelled' })
        window.requestAnimationFrame(() => deleteTriggerRef.current?.focus())
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

    /** Rows the EXACT editor puts on screen. Having a field is what makes someone
     *  visible here — the blank field IS how you give them an amount — which is a
     *  different question from whether they are on the split. `participantIds`
     *  below answers that one, and only that one is allowed near the summary. */
    const exactRows = useMemo(
        () => state.members.filter((member) => values.exactInputs[member.id] !== undefined),
        [state.members, values.exactInputs]
    )
    const membersNotInExact = state.members.filter((member) => values.exactInputs[member.id] === undefined)
    const weightedInputs = values.splitMode === 'PERCENTAGE' ? values.percentageInputs : values.shareInputs
    const weightedRows = state.members.filter((member) => weightedInputs[member.id] !== undefined)
    const membersNotInWeighted = state.members.filter((member) => weightedInputs[member.id] === undefined)
    const shareWeightTotal = shareWeightEntries(values).reduce((total, share) => total + BigInt(share.weight), 0n)

    const payer = state.members.find((member) => member.id === values.paidById)
    const payerName = values.newPaidByName || payer?.name
    const participantIds =
        values.splitMode === 'EQUAL'
            ? values.participantsTouched
                ? values.participantIds
                : state.members.map((member) => member.id)
            : values.splitMode === 'EXACT'
              ? exactParticipantIds(values, currencies, locale)
              : weightedParticipantIds(values, locale)
    const participants = state.members.filter((member) => participantIds.includes(member.id))
    const participantSummary =
        participants.length === state.members.length
            ? t('everyone')
            : participants.length === 0
              ? t('choosePeople')
              : participants.length === 1
                ? participants[0].name
                : t('peopleSummary', { name: participants[0].name, count: participants.length - 1 })
    const splitModeSummary =
        values.splitMode === 'EQUAL'
            ? t('equally')
            : values.splitMode === 'EXACT'
              ? t('exactAmounts')
              : values.splitMode === 'PERCENTAGE'
                ? t('percentage')
                : t('shares')
    /** The strip's three sub-labels are captions, not headings, and "paid" and
     *  "date" already read that way — so this one is lower case too. It is also
     *  the short form: "Exact amounts" truncated to "Exact amou…" in a 1.45fr
     *  column at 390px, and shortening the word is cheaper than widening the
     *  column at the payer's and the date's expense. The button's aria-label
     *  keeps the full wording. */
    const splitModeCaption =
        values.splitMode === 'EQUAL'
            ? t('equallyShort')
            : values.splitMode === 'EXACT'
              ? t('exactShort')
              : values.splitMode === 'PERCENTAGE'
                ? t('percentageShort')
                : t('sharesShort')
    const splitModeHint =
        values.splitMode === 'EQUAL'
            ? t('equallyHint')
            : values.splitMode === 'EXACT'
              ? t('exactAmountsHint')
              : values.splitMode === 'PERCENTAGE'
                ? t('percentageHint')
                : t('sharesHint')
    /** A collapsed disclosure still shows the selected advanced radio. Hiding
     *  it would leave the exposed radiogroup with no checked item while the
     *  percentage/share editor remained active. */
    const visibleAdvancedSplitModes = moreSplitOptionsOpen
        ? ADVANCED_SPLIT_MODES
        : values.splitMode === 'EQUAL'
          ? []
          : [values.splitMode]
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
    const filingMeta = expense
        ? {
              by:
                  expense.createdById === null
                      ? tExpenses('filedByAnon')
                      : expense.createdById === meId
                        ? tExpenses('filedByYou')
                        : tExpenses('filedBy', {
                              name:
                                  state.members.find((member) => member.id === expense.createdById)?.name ??
                                  tExpenses('someone'),
                          }),
              when: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
                  new Date(expense.createdAt)
              ),
          }
        : null
    /** Every `ExpenseFormError` code is a key under `validation`, so a new refusal
     *  reason cannot ship with no sentence to show for it. */
    const validationCopy = validation ? t(`validation.${validation}`) : null
    const amountInvalid =
        submitted &&
        (validation === 'AMOUNT_REQUIRED' || validation === 'AMOUNT_INVALID' || validation === 'AMOUNT_NEGATIVE')
    const positiveTotal = totalMinor !== null && BigInt(totalMinor) > 0n
    /**
     * A long amount runs out of room in two places at once, and both are the same
     * fact: at 390px the composer field is 204px wide and the primary button is
     * one line. Past nine characters `text-h3` clips the tail with no way to read
     * it back — an input does not scroll home when focus leaves — and
     * "Add {amount} expense" wraps onto a second line. So the display type steps
     * down, and the button falls back to its plain label, where the amount was
     * only ever confirmation of what is already legible in the composer.
     */
    const amountChars = values.amountInput.trim().length
    const amountTextSize = amountChars > 13 ? 'text-h5' : amountChars > 9 ? 'text-h4' : 'text-h3'
    const primaryLabel = expense
        ? t('save')
        : positiveTotal && amountChars <= 9
          ? t('addWithAmount', { amount: formatMoney(totalMinor!, values.currency, currencies, locale) })
          : t('add')
    const pending = addExpense.isPending || updateExpense.isPending

    return (
        <Drawer
            open={open}
            onOpenChange={(next) => !next && close()}
            // Vaul snapshots the sheet's height when the software keyboard opens.
            // If an editor mounts while that keyboard closes, it restores the old
            // pixel height and clips the new section. Fall back to native input
            // positioning so the sheet can return to its intrinsic height.
            repositionInputs={false}
        >
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
                /**
                 * The currency menu is portalled outside this sheet so it can escape the scroll
                 * viewport, which makes its search field "outside" for both of the mechanisms this
                 * sheet runs. These two are the DISMISSAL half: without them, focus landing in the
                 * menu is an outside interaction and the sheet closes under the reader.
                 *
                 * They do NOT release the focus trap — that is Radix's FocusScope, which reads
                 * neither prop, and `CurrencySelect` releases it for its own menu.
                 */
                onFocusOutside={(event) => {
                    const target = event.target
                    if (target instanceof Element && target.closest('[data-currency-menu]')) event.preventDefault()
                }}
                onInteractOutside={(event) => {
                    const target = event.target
                    if (target instanceof Element && target.closest('[data-currency-menu]')) event.preventDefault()
                }}
            >
                <DrawerHeader className="flex shrink-0 flex-row items-end justify-between px-4 pb-2 pt-0 text-left">
                    <DrawerTitle className="text-h5">{expense ? t('editTitle') : t('addTitle')}</DrawerTitle>
                    <CloseButton onClick={close} label={t('close')} data-testid="close-expense" />
                </DrawerHeader>
                {filingMeta && (
                    <p
                        data-testid="expense-filing-meta"
                        className="shrink-0 px-4 pb-1 text-h10 uppercase tracking-wide text-grey-1"
                    >
                        {filingMeta.by} · {filingMeta.when}
                    </p>
                )}

                <DrawerBody ref={formRef} className="gap-3 pb-6 pt-2" data-testid="expense-scroll">
                    <ExpenseComposer
                        amount={{
                            inputRef: amountRef,
                            value: values.amountInput,
                            decimals,
                            invalid: amountInvalid,
                            textSizeClass: amountTextSize,
                            onChange: (value) => {
                                patch({ amountInput: value })
                                dispatchWorkflow({ type: 'form-field-edited' })
                            },
                            onBlur: () => {
                                repairFieldRoles()
                                normaliseAmount()
                            },
                        }}
                        currency={{
                            value: values.currency,
                            choices: currencies,
                            suggested: suggestedCurrencies,
                            roomCurrency: state.room.currency,
                            onChange: (code) => patch({ currency: code }),
                        }}
                        description={{
                            value: values.description,
                            onChange: (value) => {
                                patch({ description: value })
                                dispatchWorkflow({ type: 'form-field-edited' })
                            },
                            onBlur: () => repairFieldRoles(),
                        }}
                        editor={editor}
                        onToggleEditor={(next) => dispatchWorkflow({ type: 'editor-toggled', editor: next })}
                        payer={payer}
                        payerName={payerName}
                        participants={participants}
                        participantSummary={participantSummary}
                        splitModeSummary={splitModeSummary}
                        splitModeCaption={splitModeCaption}
                        dateSummary={dateSummary}
                        repairNotice={fieldRepairNotice}
                        motionAllowed={motionAllowed}
                        validationCopy={validationCopy}
                        labels={{
                            amount: t('amount'),
                            currency: t('currency'),
                            description: t('description'),
                            descriptionPlaceholder: t('descriptionPlaceholder'),
                            paidBy: t('paidBy'),
                            paidBySummary: (name) => t('paidBySummary', { name }),
                            choosePayer: t('choosePayer'),
                            paid: t('paid'),
                            splitSummary: (people, mode) => t('splitSummary', { people, mode }),
                            dateSummary: (date) => t('dateSummary', { date }),
                            dateShort: t('dateShort'),
                            amountRequired: t('validation.AMOUNT_REQUIRED'),
                        }}
                    />

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
                            <ScanButton onFile={(file) => dispatchWorkflow({ type: 'scan-selected', file })} />
                            <QuickAdd
                                slug={slug}
                                roomCurrency={state.room.currency}
                                currencies={currencies}
                                values={values}
                                onApply={(next) => {
                                    setValues(next)
                                    dispatchWorkflow({ type: 'quick-add-applied' })
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
                                    onClick={() => dispatchWorkflow({ type: 'editor-closed' })}
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
                                                <MemberAvatar
                                                    name={member.name}
                                                    avatar={member.avatar}
                                                    palette={member.avatarPalette}
                                                    size={27}
                                                />
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
                                            dispatchWorkflow({ type: 'payer-draft-opened' })
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
                                            onChange={(event) =>
                                                dispatchWorkflow({
                                                    type: 'payer-name-changed',
                                                    name: event.target.value,
                                                })
                                            }
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
                                            onClick={() => dispatchWorkflow({ type: 'payer-draft-closed' })}
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
                                    <p className="mt-1 text-xs text-grey-1">{splitModeHint}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => dispatchWorkflow({ type: 'editor-closed' })}
                                    aria-label={t('collapseSection')}
                                    data-testid="collapse-split-editor"
                                    className="flex size-11 shrink-0 items-center justify-center bg-transparent transition-transform hover:-translate-y-0.5 active:translate-y-[1px]"
                                >
                                    <Icon name="chevron-up" size={24} />
                                </button>
                            </div>
                            <div className="flex flex-col gap-3 p-3">
                                <div className="flex flex-col gap-2">
                                    <div role="radiogroup" aria-label={t('splitMode')} className="flex flex-col gap-2">
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={values.splitMode === 'EQUAL'}
                                            tabIndex={values.splitMode === 'EQUAL' ? 0 : -1}
                                            onKeyDown={(event) => moveSplitMode(event, 'EQUAL')}
                                            onClick={() => {
                                                setSplitMode('EQUAL')
                                                feedback('tick')
                                            }}
                                            data-testid="split-equal"
                                            className={cn(
                                                'min-h-11 rounded-md border border-n-1 px-3 py-2 text-h9 transition-colors duration-150',
                                                values.splitMode === 'EQUAL' ? 'bg-n-1 text-white' : 'bg-white text-n-1'
                                            )}
                                        >
                                            {t('equally')}
                                        </button>

                                        {visibleAdvancedSplitModes.length > 0 && (
                                            <div
                                                id="expense-more-split-options"
                                                className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                                            >
                                                {visibleAdvancedSplitModes.map((mode) => {
                                                    const label =
                                                        mode === 'EXACT'
                                                            ? t('exactAmounts')
                                                            : mode === 'PERCENTAGE'
                                                              ? t('percentage')
                                                              : t('shares')
                                                    return (
                                                        <button
                                                            key={mode}
                                                            type="button"
                                                            role="radio"
                                                            aria-checked={values.splitMode === mode}
                                                            tabIndex={values.splitMode === mode ? 0 : -1}
                                                            onKeyDown={(event) => moveSplitMode(event, mode)}
                                                            onClick={() => {
                                                                setSplitMode(mode)
                                                                feedback('tick')
                                                            }}
                                                            data-testid={`split-${mode.toLowerCase()}`}
                                                            className={cn(
                                                                'min-h-11 rounded-md border border-n-1 px-3 py-2 text-h9 transition-colors duration-150',
                                                                values.splitMode === mode
                                                                    ? 'bg-n-1 text-white'
                                                                    : 'bg-white text-n-1'
                                                            )}
                                                        >
                                                            {label}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        aria-expanded={moreSplitOptionsOpen}
                                        aria-controls="expense-more-split-options"
                                        onClick={() => dispatchWorkflow({ type: 'advanced-options-toggled' })}
                                        data-testid="more-split-options"
                                        className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-dashed border-n-1 bg-white px-3 py-2 text-h9"
                                    >
                                        {t('moreOptions')}
                                        <Icon name={moreSplitOptionsOpen ? 'chevron-up' : 'chevron-down'} size={18} />
                                    </button>
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
                                                            palette={member.avatarPalette}
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
                                                                        initial={
                                                                            motionAllowed
                                                                                ? { scale: 0.2, opacity: 0 }
                                                                                : false
                                                                        }
                                                                        animate={{ scale: 1, opacity: 1 }}
                                                                        exit={
                                                                            motionAllowed
                                                                                ? { scale: 0.2, opacity: 0 }
                                                                                : undefined
                                                                        }
                                                                        transition={
                                                                            motionAllowed
                                                                                ? {
                                                                                      type: 'spring',
                                                                                      stiffness: 600,
                                                                                      damping: 24,
                                                                                  }
                                                                                : { duration: 0 }
                                                                        }
                                                                        data-motion-surface
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
                                ) : values.splitMode === 'EXACT' ? (
                                    <div className="flex flex-col gap-2">
                                        <ul className="flex flex-col gap-2">
                                            {exactRows.map((member) => (
                                                <li
                                                    key={member.id}
                                                    className="flex items-center gap-2 rounded-md border border-n-1 bg-white p-2"
                                                >
                                                    <MemberAvatar
                                                        name={member.name}
                                                        avatar={member.avatar}
                                                        palette={member.avatarPalette}
                                                        size={28}
                                                    />
                                                    <span className="w-20 shrink-0 truncate text-h8">
                                                        {member.name}
                                                    </span>
                                                    <input
                                                        value={values.exactInputs[member.id] ?? ''}
                                                        onChange={(event) => typeExact(member.id, event.target.value)}
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
                                                    {canTakeRemainder(member.id) && (
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
                                            animate={
                                                motionAllowed && allocationSettled
                                                    ? { scale: [1, 1.03, 1] }
                                                    : { scale: 1 }
                                            }
                                            transition={
                                                motionAllowed ? { duration: 0.3, ease: 'easeOut' } : { duration: 0 }
                                            }
                                            data-motion-surface
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
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <ul className="flex flex-col gap-2">
                                            {weightedRows.map((member) => (
                                                <li
                                                    key={member.id}
                                                    className="flex items-center gap-2 rounded-md border border-n-1 bg-white p-2"
                                                >
                                                    <MemberAvatar
                                                        name={member.name}
                                                        avatar={member.avatar}
                                                        palette={member.avatarPalette}
                                                        size={28}
                                                    />
                                                    <span className="w-20 shrink-0 truncate text-h8">
                                                        {member.name}
                                                    </span>
                                                    <div className="flex h-12 min-w-0 flex-1 items-center rounded-sm border border-n-1 bg-white focus-within:ring-2 focus-within:ring-n-1">
                                                        <input
                                                            value={weightedInputs[member.id] ?? ''}
                                                            onChange={(event) =>
                                                                values.splitMode === 'PERCENTAGE'
                                                                    ? typePercentage(member.id, event.target.value)
                                                                    : typeShares(member.id, event.target.value)
                                                            }
                                                            onFocus={(event) => event.target.select()}
                                                            onBlur={() =>
                                                                values.splitMode === 'PERCENTAGE'
                                                                    ? normalisePercentage(member.id)
                                                                    : normaliseShares(member.id)
                                                            }
                                                            inputMode={
                                                                values.splitMode === 'PERCENTAGE'
                                                                    ? 'decimal'
                                                                    : 'numeric'
                                                            }
                                                            aria-label={
                                                                values.splitMode === 'PERCENTAGE'
                                                                    ? t('percentageFor', { name: member.name })
                                                                    : t('sharesFor', { name: member.name })
                                                            }
                                                            aria-invalid={
                                                                submitted &&
                                                                (validation === 'PERCENTAGE_INVALID' ||
                                                                    validation === 'PERCENTAGES_DO_NOT_ADD_UP' ||
                                                                    validation === 'SHARE_WEIGHT_INVALID')
                                                            }
                                                            data-testid={
                                                                values.splitMode === 'PERCENTAGE'
                                                                    ? 'percentage-input'
                                                                    : 'shares-input'
                                                            }
                                                            data-member={member.name}
                                                            className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-base tabular-nums outline-none"
                                                        />
                                                        <span
                                                            aria-hidden="true"
                                                            className="shrink-0 pr-3 text-sm text-grey-1"
                                                        >
                                                            {values.splitMode === 'PERCENTAGE' ? '%' : t('sharesUnit')}
                                                        </span>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>

                                        {membersNotInWeighted.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {membersNotInWeighted.map((member) => (
                                                    <button
                                                        key={member.id}
                                                        type="button"
                                                        onClick={() =>
                                                            values.splitMode === 'PERCENTAGE'
                                                                ? patch({
                                                                      percentageInputs: {
                                                                          ...values.percentageInputs,
                                                                          [member.id]: '',
                                                                      },
                                                                  })
                                                                : patch({
                                                                      shareInputs: {
                                                                          ...values.shareInputs,
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

                                        {values.splitMode === 'PERCENTAGE' ? (
                                            <motion.div
                                                data-testid="percentage-readout"
                                                role="status"
                                                aria-live="polite"
                                                animate={
                                                    motionAllowed && percentageSettled
                                                        ? { scale: [1, 1.03, 1] }
                                                        : { scale: 1 }
                                                }
                                                transition={
                                                    motionAllowed ? { duration: 0.3, ease: 'easeOut' } : { duration: 0 }
                                                }
                                                data-motion-surface
                                                className={cn(
                                                    'flex items-center justify-between rounded-md border border-n-1 px-3 py-3 text-h8 transition-colors duration-200',
                                                    percentageSettled ? 'bg-green-1' : 'bg-primary-3'
                                                )}
                                            >
                                                <span>
                                                    {percentageSettled
                                                        ? t('percentageAllocated')
                                                        : percentageRemaining.startsWith('-')
                                                          ? t('percentageOverBy')
                                                          : t('percentageLeft')}
                                                </span>
                                                <span className="flex items-center gap-2 tabular-nums">
                                                    {percentageSettled && <Icon name="check" size={18} />}
                                                    {!percentageSettled &&
                                                        `${formatAmountInput(
                                                            percentageRemaining.replace('-', ''),
                                                            2,
                                                            locale
                                                        )}%`}
                                                </span>
                                            </motion.div>
                                        ) : (
                                            <p
                                                data-testid="shares-readout"
                                                role="status"
                                                aria-live="polite"
                                                className="rounded-md border border-n-1 bg-primary-3 px-3 py-3 text-sm"
                                            >
                                                {t('sharesTotal', { total: shareWeightTotal.toString() })}
                                            </p>
                                        )}
                                        <p className="text-sm text-grey-1">
                                            {values.splitMode === 'PERCENTAGE'
                                                ? t('percentageCaption')
                                                : t('sharesCaption')}
                                        </p>
                                    </div>
                                )}

                                {!addingParticipant && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            dispatchWorkflow({ type: 'participant-draft-opened' })
                                            requestAnimationFrame(() => participantNameRef.current?.focus())
                                        }}
                                        className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-dashed border-n-1 bg-white px-3 py-2 text-h8"
                                        data-testid="add-participant"
                                    >
                                        <Icon name="plus" size={18} />
                                        {t('addPayer')}
                                    </button>
                                )}

                                {addingParticipant && (
                                    <form onSubmit={createParticipant} className="flex items-center gap-2">
                                        <BaseInput
                                            ref={participantNameRef}
                                            value={newParticipantName}
                                            onChange={(event) =>
                                                dispatchWorkflow({
                                                    type: 'participant-name-changed',
                                                    name: event.target.value,
                                                })
                                            }
                                            placeholder={t('payerNamePlaceholder')}
                                            aria-label={t('payerNamePlaceholder')}
                                            maxLength={80}
                                            variant="sm"
                                            data-testid="new-participant-name"
                                        />
                                        <button
                                            type="submit"
                                            disabled={!newParticipantName.trim() || addMember.isPending}
                                            aria-label={t('confirmPayer')}
                                            aria-busy={addMember.isPending}
                                            data-testid="add-participant-submit"
                                            className="shadow-2 flex size-12 shrink-0 items-center justify-center rounded-md border border-n-1 bg-primary-1 disabled:opacity-50"
                                        >
                                            <Icon name="check" size={19} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={t('cancelPayer')}
                                            onClick={() => dispatchWorkflow({ type: 'participant-draft-closed' })}
                                            className="flex size-12 shrink-0 items-center justify-center rounded-md border border-n-1 bg-white"
                                        >
                                            <Icon name="x" size={19} />
                                        </button>
                                    </form>
                                )}

                                {participantError && (
                                    <p role="alert" className="text-sm font-bold text-error">
                                        {participantError}
                                    </p>
                                )}
                            </div>
                        </section>
                    )}

                    {editor === 'date' && (
                        <ExpenseDateEditor
                            summary={dateSummary}
                            value={selectedDateInput}
                            today={todayInput}
                            yesterday={yesterdayInput}
                            labels={{
                                date: t('date'),
                                whenWasIt: t('whenWasIt'),
                                today: tDates('today'),
                                yesterday: tDates('yesterday'),
                                collapse: t('collapseSection'),
                            }}
                            onChooseRelative={chooseRelativeDate}
                            onChange={(value) => {
                                patch({ date: fromDateInputValue(value, values.date) })
                                dispatchWorkflow({ type: 'editor-closed' })
                            }}
                            onClose={() => dispatchWorkflow({ type: 'editor-closed' })}
                        />
                    )}

                    {submitted && validationCopy && !amountInvalid && (
                        <p
                            ref={validationAlertRef}
                            role="alert"
                            // Programmatic focus target only — `save()` brings it into view
                            // and puts the cursor on it, and it is not in the tab order.
                            tabIndex={-1}
                            className="flex items-center gap-2 text-sm font-bold text-error outline-none"
                        >
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

                <ExpenseDrawerActions
                    editing={Boolean(expense)}
                    pending={pending}
                    deleting={deleteExpense.isPending}
                    confirmingDelete={confirmingDelete}
                    deleteTriggerRef={deleteTriggerRef}
                    labels={{
                        primary: primaryLabel,
                        confirmDelete: t('confirmDelete'),
                        slideDelete: t('slideDelete'),
                        deleting: t('deleting'),
                        cancelDelete: t('confirmDeleteNo'),
                        delete: t('delete'),
                    }}
                    onSave={save}
                    onStartDelete={() => dispatchWorkflow({ type: 'delete-confirmation-started' })}
                    onConfirmDelete={remove}
                    onCancelDelete={cancelDelete}
                />
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
                    onCancel={() => dispatchWorkflow({ type: 'scan-cancelled' })}
                    onApply={(next) => {
                        setValues(next)
                        // The form is now reconciled by construction, so an error
                        // left over from before the scan is stale by definition.
                        dispatchWorkflow({ type: 'scan-applied' })
                    }}
                />
            )}
        </Drawer>
    )
}
