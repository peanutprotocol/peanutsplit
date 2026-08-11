'use client'

/**
 * Bring a Splitwise group across.
 *
 * THE FILE NEVER LEAVES THE DEVICE. It is read with `File.text()`, parsed here, and only the
 * structured result is posted — descriptions, amounts and who owes whom are a group's private
 * business, and there is no reason for a server to hold the document itself. It also means the
 * preview is instant and works with no network at all.
 *
 * Three steps, and the middle one is the point: nothing is written until somebody has looked at
 * what we understood. An import that silently guesses wrong is worse than one that refuses.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { BaseInput } from '@/components/ui/BaseInput'
import { roomDoodleFor } from '@/lib/room-doodle'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { CurrencySelect } from '@/components/room/CurrencySelect'
import { LinkMoment } from '@/components/room/LinkMoment'
import { track, trackFirstSharedBalance } from '@/lib/analytics'
import { isApiError } from '@/lib/api'
import type { ImportedExpenseInput, ImportIntoRoomResult, RoomState, RoomStateWithMember } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { useErrorMessage } from '@/lib/error-messages'
import { writeIdentity } from '@/lib/identity'
import {
    deferRoomInstallAfterCompetingGuidance,
    markRoomCreatedHere,
    noteRoomShareCompleted,
} from '@/lib/install-funnel'
import { importedRoomPath } from '@/lib/import-routes'
import {
    fingerprintParsedImportFile,
    type FingerprintedImportChoice,
    type FingerprintedImportFile,
} from '@/lib/import-source-fingerprint'
import { formatMoney } from '@/lib/money'
import { useCurrencies, useImportIntoRoom, useImportRoom } from '@/lib/queries'
import { rememberRoom } from '@/lib/recent-rooms'
import { useMotionAllowed } from '@/lib/use-motion'
import { useRateAvailability } from '@/lib/use-rate'
import {
    MAX_FILE_CHARS,
    SplitwiseParseError,
    reconcileTotalBalance,
    type ImportWarning,
    type ParseErrorCode,
    type SplitwiseImport as ParsedFile,
} from '@/lib/splitwise-csv'
import { parseImportFile, type ParsedImportFile, type SkippedImportChoice } from '@/lib/splitpro-import'
import { useFeedback } from '@/lib/use-settings'
import {
    ExistingRoomImportContext,
    ExistingRoomImportCurrencyProblem,
    ExistingRoomImportFields,
} from './ExistingRoomImportFields'
import {
    existingRoomMappingProblem,
    formatImportedAt,
    importMemberMappings,
    initialExistingRoomMemberDrafts,
    unsupportedImportCurrencies,
    type ExistingRoomMappingProblem,
    type ExistingRoomMemberDraft,
} from './existing-room-mapping'

/** Enough to see what came in without turning the preview into the room itself. */
const WARNINGS_SHOWN = 8

export interface ExistingRoomImportTarget {
    state: RoomState
    /** Attribution only; holding the slug remains sufficient to write. */
    memberToken?: string | null
    /** Used only to visibly suggest which imported person is the current visitor. */
    memberId?: string | null
}

const conversionFailureCurrencies = (error: unknown, candidates: readonly string[]): string[] => {
    if (!isApiError(error, 'IMPORT_CURRENCY_CONVERSION_UNSUPPORTED') && !isApiError(error, 'NO_RATE')) {
        return []
    }
    const details = error.details
    if (typeof details !== 'object' || details === null) return []
    const currencies = (details as { currencies?: unknown }).currencies
    if (!Array.isArray(currencies)) return []
    const candidateSet = new Set(candidates)
    return [...new Set(currencies.filter((code): code is string => typeof code === 'string'))].filter((code) =>
        candidateSet.has(code)
    )
}

export function SplitwiseImport({ targetRoom }: { targetRoom?: ExistingRoomImportTarget } = {}) {
    const t = useTranslations('import')
    const tExisting = useTranslations('import.existing')
    const tShare = useTranslations('room.share')
    const locale = useLocale()
    const router = useRouter()
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()
    const errorMessage = useErrorMessage()
    const { data: currencies } = useCurrencies()
    const importRoom = useImportRoom()
    const importIntoRoom = useImportIntoRoom(targetRoom?.state.room.slug ?? '', targetRoom?.memberToken)
    const inputRef = useRef<HTMLInputElement>(null)

    const [parsed, setParsed] = useState<ParsedFile | null>(null)
    const [parsedFile, setParsedFile] = useState<FingerprintedImportFile | null>(null)
    const [choiceIndex, setChoiceIndex] = useState(0)
    const [sourceFingerprint, setSourceFingerprint] = useState<string | null>(null)
    const [roomName, setRoomName] = useState('')
    const [currency, setCurrency] = useState('EUR')
    const [names, setNames] = useState<string[]>([])
    const [memberDrafts, setMemberDrafts] = useState<ExistingRoomMemberDraft[]>([])
    /** Source code → query data timestamp observed when the write rejected it.
     * A later successful probe clears the derived latch without another upload. */
    const [serverRateRejections, setServerRateRejections] = useState<Record<string, number>>({})
    /**
     * Null until somebody picks, and the submit button is disabled until they do.
     *
     * It used to default to 0, which is not a default — it is a guess that the
     * first name in the CSV header is you, dressed up as a filled-in field.
     * Whoever it lands on gets the creator's member token, so the person who ran
     * the import ends up holding somebody else's identity in a room they cannot
     * then claim themselves. A radio group nobody read is exactly how that
     * happens.
     */
    const [meIndex, setMeIndex] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [dragging, setDragging] = useState(false)
    const [created, setCreated] = useState<RoomStateWithMember | null>(null)
    const [appended, setAppended] = useState<ImportIntoRoomResult | null>(null)
    const [appendCreatedFirstSharedBalance, setAppendCreatedFirstSharedBalance] = useState(false)

    /**
     * Every parse failure the parser can name, spelled out one literal at a time rather than
     * `t(\`errors.\${code}\`)`. A computed key is invisible to `pnpm i18n:audit`, and a missing
     * translation in next-intl renders as the dotted key path — which is what somebody staring at
     * a file that will not import would see instead of a reason.
     */
    const parseErrorMessage = (code: ParseErrorCode): string => {
        switch (code) {
            case 'NOT_SPLITWISE_CSV':
                return t('errors.NOT_SPLITWISE_CSV')
            case 'MALFORMED_CSV':
                return t('errors.MALFORMED_CSV')
            case 'MALFORMED_JSON':
                return t('errors.MALFORMED_JSON')
            case 'SPLITPRO_DIRECT_UNRESOLVED':
                return t('errors.SPLITPRO_DIRECT_UNRESOLVED')
            case 'NO_MEMBERS':
                return t('errors.NO_MEMBERS')
            case 'NO_EXPENSES':
                return t('errors.NO_EXPENSES')
            case 'TOO_MANY_MEMBERS':
                return t('errors.TOO_MANY_MEMBERS')
            case 'TOO_MANY_EXPENSES':
                return t('errors.TOO_MANY_EXPENSES')
            case 'FILE_TOO_BIG':
                return t('errors.FILE_TOO_BIG')
        }
    }

    /** Same discipline, and the reason each warning carries a code instead of a sentence: the
     *  parser is shared with the server and has no business holding user-facing copy. */
    const warningMessage = (warning: ImportWarning): string => {
        const row = warning.row ?? 0
        const detail = warning.detail ?? ''
        switch (warning.code) {
            case 'ROW_UNBALANCED':
                return t('warnings.ROW_UNBALANCED', { row })
            case 'ROW_UNSUPPORTED_CURRENCY':
                return t('warnings.ROW_UNSUPPORTED_CURRENCY', { row, detail })
            case 'ROW_NO_PAYER':
                return t('warnings.ROW_NO_PAYER', { row })
            case 'ROW_ZERO_COST':
                return t('warnings.ROW_ZERO_COST', { row })
            case 'ROW_BAD_AMOUNT':
                return t('warnings.ROW_BAD_AMOUNT', { row })
            case 'ROW_BAD_DATE':
                return t('warnings.ROW_BAD_DATE', { row })
            case 'ROW_DESCRIPTION_TRUNCATED':
                return t('warnings.ROW_DESCRIPTION_TRUNCATED', { row })
            case 'ROW_CATEGORY_TRUNCATED':
                return t('warnings.ROW_CATEGORY_TRUNCATED', { row })
            case 'MEMBER_NAME_TRUNCATED':
                return t('warnings.MEMBER_NAME_TRUNCATED', { detail })
            case 'MULTI_PAYER_SPLIT':
                return t('warnings.MULTI_PAYER_SPLIT', { detail })
            case 'PAYMENT_ROWS':
                return t('warnings.PAYMENT_ROWS')
            case 'MIXED_CURRENCY':
                return t('warnings.MIXED_CURRENCY', { detail })
            case 'DUPLICATE_MEMBER_NAME':
                return t('warnings.DUPLICATE_MEMBER_NAME', { detail })
            case 'TRUNCATED_HISTORY':
                return t('warnings.TRUNCATED_HISTORY', { count: Number(detail) || 0 })
            case 'SPLITPRO_BALANCES_ONLY':
                return t('warnings.SPLITPRO_BALANCES_ONLY')
            case 'SPLITPRO_PAIR_HISTORY':
                return t('warnings.SPLITPRO_PAIR_HISTORY')
            case 'SPLITPRO_SPLIT_MODE_FLATTENED':
                return t('warnings.SPLITPRO_SPLIT_MODE_FLATTENED')
            case 'SPLITPRO_MISSING_NAMES':
                return t('warnings.SPLITPRO_MISSING_NAMES', { count: Number(detail) || 0 })
            case 'SPLITPRO_BALANCES_SKIPPED':
                return t('warnings.SPLITPRO_BALANCES_SKIPPED', { count: Number(detail) || 0 })
            case 'SPLITPRO_UNSUPPORTED_CURRENCY':
                return t('warnings.SPLITPRO_UNSUPPORTED_CURRENCY', { detail })
        }
    }

    const applyChoice = useCallback(
        (choice: FingerprintedImportChoice, index: number, source: ParsedImportFile['source']) => {
            setChoiceIndex(index)
            setParsed(choice.parsed)
            setSourceFingerprint(choice.sourceFingerprint)
            setRoomName(choice.roomName || t('preview.fallbackName'))
            setCurrency(choice.parsed.suggestedCurrency)
            setNames(choice.parsed.members)
            setMemberDrafts(
                targetRoom
                    ? initialExistingRoomMemberDrafts(
                          choice.parsed.members,
                          targetRoom.state.members,
                          source === 'splitpro' ? targetRoom.memberId : null
                      )
                    : []
            )
            setMeIndex(null)
            setError(null)
            setServerRateRejections({})
        },
        [t, targetRoom]
    )

    const accept = useCallback(
        async (file: File) => {
            setError(null)
            track('import_started')

            if (file.size > MAX_FILE_CHARS) {
                setError(t('errors.FILE_TOO_BIG'))
                track('import_failed', { reason: 'FILE_TOO_BIG' })
                return
            }

            let text: string
            try {
                text = await file.text()
            } catch {
                setError(t('errors.READ_FAILED'))
                track('import_failed', { reason: 'READ_FAILED' })
                return
            }

            try {
                const result = await fingerprintParsedImportFile(text, parseImportFile(text, file.name))
                setParsedFile(result)
                applyChoice(result.choices[0], 0, result.source)
                feedback('pop')
                // Counts only. Not the group's name, not a member's, not an amount.
                track('import_parsed', {
                    source: result.source,
                    groups: result.choices.length,
                    expenses: result.choices[0].parsed.expenses.length,
                    members: result.choices[0].parsed.members.length,
                })
            } catch (err) {
                const code = err instanceof SplitwiseParseError ? err.code : null
                setError(code ? parseErrorMessage(code) : t('errors.READ_FAILED'))
                feedback('error')
                track('import_failed', { reason: code ?? 'PARSE_FAILED' })
            }
        },
        [t, feedback, applyChoice]
    )

    const onDrop = (event: React.DragEvent) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files?.[0]
        if (file) void accept(file)
    }

    /** Totals per currency — a mixed-currency file has no single number, and inventing one here
     *  by pre-converting would be quoting a rate before anyone agreed to it. */
    const totals = useMemo(() => {
        if (!parsed) return []
        const sums = new Map<string, bigint>()
        for (const expense of parsed.expenses) {
            sums.set(expense.currencyCode, (sums.get(expense.currencyCode) ?? 0n) + BigInt(expense.costMinor))
        }
        return [...sums.entries()].map(([code, minor]) => formatMoney(minor.toString(), code, currencies, locale))
    }, [parsed, currencies, locale])

    /**
     * The file's own arithmetic, checked against ours before anything is written. Meaningful only
     * for a single-currency export with a summary row — see `reconcileTotalBalance` — so most
     * files get nothing here, and the ones that do get either a quiet reassurance or the one
     * warning in this screen that is about MONEY rather than about a row.
     */
    const drift = useMemo(() => (parsed ? reconcileTotalBalance(parsed) : null), [parsed])

    const nameProblem = useMemo(() => {
        const trimmed = names.map((name) => name.trim())
        if (trimmed.some((name) => name === '')) return t('errors.EMPTY_NAME')
        if (new Set(trimmed.map((name) => name.toLowerCase())).size !== trimmed.length)
            return t('errors.DUPLICATE_NAMES')
        return null
    }, [names, t])

    const memberMappingProblem = useMemo(
        () => (targetRoom ? existingRoomMappingProblem(memberDrafts, targetRoom.state.members) : null),
        [memberDrafts, targetRoom]
    )
    const targetCurrency = targetRoom?.state.room.currency ?? currency
    const catalogUnsupportedCurrencies = useMemo(
        () => (parsed ? unsupportedImportCurrencies(parsed.expenses, targetCurrency, currencies) : []),
        [parsed, targetCurrency, currencies]
    )
    const rateSourceCurrencies = useMemo(() => {
        if (!parsed) return []
        const catalogUnsupported = new Set(catalogUnsupportedCurrencies)
        return [...new Set(parsed.expenses.map((expense) => expense.currencyCode))].filter(
            (source) => source !== targetCurrency && !catalogUnsupported.has(source)
        )
    }, [parsed, targetCurrency, catalogUnsupportedCurrencies])
    const rateProbes = useRateAvailability(
        rateSourceCurrencies,
        targetCurrency,
        parsed !== null,
        Object.keys(serverRateRejections)
    )
    const liveUnavailableCurrencies = rateSourceCurrencies.filter(
        (_, index) => rateProbes[index]?.isSuccess && rateProbes[index]?.data === null
    )
    const serverUnavailableCurrencies = Object.entries(serverRateRejections).flatMap(
        ([code, rejectedDataUpdatedAt]) => {
            const probe = rateProbes[rateSourceCurrencies.indexOf(code)]
            const recovered = probe?.isSuccess && probe.data !== null && probe.dataUpdatedAt > rejectedDataUpdatedAt
            return recovered ? [] : [code]
        }
    )
    const recoveredServerCurrencies = Object.entries(serverRateRejections)
        .flatMap(([code, rejectedDataUpdatedAt]) => {
            const probe = rateProbes[rateSourceCurrencies.indexOf(code)]
            return probe?.isSuccess && probe.data !== null && probe.dataUpdatedAt > rejectedDataUpdatedAt ? [code] : []
        })
        .sort()
        .join(',')
    useEffect(() => {
        if (!recoveredServerCurrencies) return
        const recovered = new Set(recoveredServerCurrencies.split(','))
        setServerRateRejections((current) =>
            Object.fromEntries(Object.entries(current).filter(([code]) => !recovered.has(code)))
        )
    }, [recoveredServerCurrencies])
    const checkingRates = rateProbes.some((probe) => probe.isFetching)
    const unsupportedCurrencies = [
        ...new Set([...catalogUnsupportedCurrencies, ...liveUnavailableCurrencies, ...serverUnavailableCurrencies]),
    ]

    const memberMappingProblemMessage = (problem: ExistingRoomMappingProblem | null): string | null => {
        switch (problem) {
            case 'empty-new-name':
                return tExisting('emptyNewName')
            case 'duplicate-existing-member':
                return tExisting('duplicateExistingMember')
            case 'missing-existing-member':
                return tExisting('missingExistingMember')
            case 'duplicate-new-name':
                return tExisting('duplicateNewName')
            case 'new-name-already-exists':
                return tExisting('newNameAlreadyExists')
            case null:
                return null
        }
    }

    const rememberConversionFailure = (failure: unknown) => {
        const isConversionFailure =
            isApiError(failure, 'IMPORT_CURRENCY_CONVERSION_UNSUPPORTED') || isApiError(failure, 'NO_RATE')
        if (!isConversionFailure) return

        const unavailable = conversionFailureCurrencies(failure, rateSourceCurrencies)
        if (unavailable.length > 0) {
            setServerRateRejections((current) => {
                const next = { ...current }
                for (const code of unavailable) {
                    const probe = rateProbes[rateSourceCurrencies.indexOf(code)]
                    next[code] = probe?.dataUpdatedAt ?? 0
                }
                return next
            })
        }

        // New servers return the exact failed codes. During a rolling deploy an
        // older NO_RATE envelope may not, so recheck every candidate but do not
        // falsely label all of them unsupported.
        const toRecheck = unavailable.length > 0 ? unavailable : rateSourceCurrencies
        for (const code of toRecheck) {
            void rateProbes[rateSourceCurrencies.indexOf(code)]?.refetch()
        }
    }

    const submit = async () => {
        if (!parsed || !sourceFingerprint) return
        if (checkingRates || unsupportedCurrencies.length > 0) return
        if (targetRoom) {
            if (memberMappingProblem) return
        } else if (nameProblem || !roomName.trim() || meIndex === null) {
            return
        }
        setError(null)

        if (targetRoom) {
            try {
                // Keep the pre-mutation latch in this async closure. The mutation
                // seeds its RoomState into React Query before `mutateAsync`
                // resolves, so reading the target prop afterward can already see
                // the post-import value and lose the transition.
                const roomWasMature = targetRoom.state.room.hasReachedSharedBalance === true
                const result = await importIntoRoom.mutateAsync({
                    sourceFingerprint,
                    members: importMemberMappings(memberDrafts),
                    expenses: parsed.expenses,
                })
                const createdFirstSharedBalance = !roomWasMature && result.room.hasReachedSharedBalance === true
                if (createdFirstSharedBalance) {
                    trackFirstSharedBalance()
                    // This success page owns the post-aha share moment. Arm the
                    // same short refusal window as the room drawer up front so
                    // browser Back, a reload, or either footer action cannot
                    // replace an unfinished share with an install ask. A real
                    // share completion clears the deferral below.
                    deferRoomInstallAfterCompetingGuidance(targetRoom.state.room.slug)
                }
                track('import_completed', {
                    expenses: result.addedExpenses,
                    members: result.addedMembers,
                    target: 'existing',
                    alreadyImported: result.alreadyImported,
                })
                feedback('pop')
                setAppendCreatedFirstSharedBalance(createdFirstSharedBalance)
                setAppended(result)
            } catch (err) {
                rememberConversionFailure(err)
                setError(errorMessage(err, tExisting('failed')))
                feedback('error')
                track('import_failed', { reason: 'POST_FAILED', target: 'existing' })
            }
            return
        }

        // Guarded above: fresh-room mode requires a creator selection.
        const me = names[meIndex!].trim()

        // A renamed member has to be renamed everywhere: names are the only join key an import
        // has, so a rename that missed an expense would be an expense attributed to nobody.
        const renamed = new Map(parsed.members.map((original, i) => [original, names[i].trim()]))
        const rename = (name: string) => renamed.get(name) ?? name
        const expenses: ImportedExpenseInput[] = parsed.expenses.map((expense) => ({
            ...expense,
            paidBy: rename(expense.paidBy),
            shares: expense.shares.map((share) => ({ member: rename(share.member), amountMinor: share.amountMinor })),
        }))

        try {
            const state = await importRoom.mutateAsync({
                sourceFingerprint,
                roomName: roomName.trim(),
                // Read from the group's own name, same as a hand-made room. It used to be a
                // hardcoded 🧾, which made every imported room look identical in the list.
                emoji: roomDoodleFor(roomName),
                currency,
                creatorName: me,
                members: names.map((name) => name.trim()),
                expenses,
            })
            // Exactly as the create flow does it: the token comes back once, so it is stored
            // before anything else can throw.
            writeIdentity(state.room.slug, {
                memberId: state.memberId,
                token: state.memberToken,
                name: me,
            })
            markRoomCreatedHere(state.room.slug)
            rememberRoom({ slug: state.room.slug, name: state.room.name, emoji: state.room.emoji ?? undefined })
            track('import_completed', { expenses: expenses.length, members: names.length })
            feedback('pop')
            setCreated(state)
        } catch (err) {
            rememberConversionFailure(err)
            setError(errorMessage(err, t('errors.failed')))
            feedback('error')
            track('import_failed', { reason: 'POST_FAILED' })
        }
    }

    const startOver = () => {
        setParsed(null)
        setParsedFile(null)
        setSourceFingerprint(null)
        setChoiceIndex(0)
        setMemberDrafts([])
        setAppended(null)
        setAppendCreatedFirstSharedBalance(false)
        setError(null)
        setServerRateRejections({})
    }

    if (targetRoom && appended) {
        const importedAt = formatImportedAt(appended.importedAt, locale)
        return (
            <div className="flex flex-col gap-5">
                <ExistingRoomImportContext room={targetRoom.state.room} />
                <section
                    className="flex flex-col items-center rounded-sm border border-n-1 bg-green-1 p-5 text-center"
                    data-testid="import-existing-success"
                    data-already-imported={appended.alreadyImported ? 'true' : 'false'}
                >
                    <span className="flex size-12 items-center justify-center rounded-full border border-n-1 bg-white">
                        <Icon name="check" size={24} aria-hidden="true" />
                    </span>
                    <h2 className="mt-3 text-h5">
                        {appended.alreadyImported ? tExisting('replayTitle') : tExisting('readyTitle')}
                    </h2>
                    <p className="mt-2 text-sm leading-5 text-n-1" data-testid="imported-at">
                        {appended.alreadyImported
                            ? tExisting('replayBody', { time: importedAt })
                            : tExisting('readyBody', {
                                  expenses: appended.addedExpenses,
                                  members: appended.addedMembers,
                                  time: importedAt,
                              })}
                    </p>
                </section>
                {appendCreatedFirstSharedBalance && (
                    <LinkMoment
                        headingLevel={2}
                        slug={targetRoom.state.room.slug}
                        roomName={targetRoom.state.room.name}
                        emoji={targetRoom.state.room.emoji}
                        theme={targetRoom.state.room.theme}
                        surface="post_aha"
                        title={tShare('postAhaTitle')}
                        subtitle={tShare('postAhaSubtitle')}
                        onCompleted={() => noteRoomShareCompleted(targetRoom.state.room.slug, true)}
                    />
                )}
                <div className="flex flex-col gap-3">
                    <Button
                        variant="primary"
                        shadowSize="4"
                        className="justify-center"
                        onClick={startOver}
                        data-testid="import-another-file"
                    >
                        {tExisting('importAnother')}
                    </Button>
                    <Button
                        variant="stroke"
                        className="justify-center"
                        onClick={() => router.push(importedRoomPath(targetRoom.state.room.slug))}
                        data-testid="go-to-imported-room"
                    >
                        {tExisting('goToRoom')}
                    </Button>
                </div>
            </div>
        )
    }

    if (created) {
        return (
            <LinkMoment
                headingLevel={2}
                slug={created.room.slug}
                roomName={created.room.name}
                emoji={created.room.emoji}
                theme={created.room.theme}
                surface="room_ready"
                title={t('ready.title')}
                subtitle={t('ready.subtitle')}
                onCompleted={() =>
                    noteRoomShareCompleted(created.room.slug, created.room.hasReachedSharedBalance === true)
                }
                footer={
                    <Button
                        variant="stroke"
                        className="justify-center text-h6"
                        onClick={() => router.push(`/r/${created.room.slug}`)}
                        data-testid="go-to-imported-room"
                    >
                        {t('ready.goToRoom')}
                    </Button>
                }
            />
        )
    }

    if (!parsed) {
        return (
            <div className="flex flex-col gap-5">
                {targetRoom && <ExistingRoomImportContext room={targetRoom.state.room} />}
                <div
                    onDragOver={(event) => {
                        event.preventDefault()
                        setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    className={cn(
                        'flex flex-col items-center gap-3 rounded-sm border-2 border-dashed border-n-1 px-5 py-10 text-center transition-colors',
                        dragging ? 'bg-primary-3' : 'bg-white'
                    )}
                >
                    <Icon name="receipt" size={28} className="text-n-1" />
                    <p className="text-h7">{t('drop.title')}</p>
                    <p className="max-w-sm text-sm leading-5 text-grey-1">{t('drop.body')}</p>
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".csv,.json,text/csv,application/json"
                        // The visible button below is the only chooser in the accessibility tree.
                        // This input remains programmatically clickable without adding an invisible
                        // keyboard stop or announcing a second, unlabeled "Choose File" control.
                        tabIndex={-1}
                        aria-hidden="true"
                        className="sr-only"
                        data-testid="import-file"
                        onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) void accept(file)
                            // Picking the same file twice in a row must re-fire `change`.
                            event.target.value = ''
                        }}
                    />
                    <Button
                        variant="primary"
                        shadowSize="4"
                        width="auto"
                        className="mt-2 justify-center px-6"
                        onClick={() => inputRef.current?.click()}
                        data-testid="import-choose"
                    >
                        {t('drop.cta')}
                    </Button>
                </div>

                {error && (
                    <p role="alert" className="text-sm font-bold text-error" data-testid="import-error">
                        {error}
                    </p>
                )}

                <div className="rounded-sm border border-n-1 bg-white p-4">
                    <h2 className="text-h7">{t('howto.title')}</h2>
                    <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm leading-5 text-grey-1">
                        <li>{t('howto.step1')}</li>
                        <li>{t('howto.step2')}</li>
                        <li>{t('howto.step3')}</li>
                    </ol>
                </div>

                <p className="text-sm leading-5 text-grey-1">{t('drop.privacy')}</p>
            </div>
        )
    }

    const shownWarnings = parsed.warnings.slice(0, WARNINGS_SHOWN)
    const hiddenWarnings = parsed.warnings.length - shownWarnings.length

    const skippedChoiceMessage = (choice: SkippedImportChoice) =>
        t('groups.skipped', { name: choice.roomName, reason: parseErrorMessage(choice.reason) })

    return (
        <motion.div
            initial={motionAllowed ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={motionAllowed ? { type: 'spring', stiffness: 300, damping: 30 } : { duration: 0 }}
            data-motion-surface
            className="flex flex-col gap-6"
        >
            {targetRoom && <ExistingRoomImportContext room={targetRoom.state.room} />}

            <div className="rounded-sm border border-n-1 bg-green-1 p-4">
                <p className="text-h7">
                    {t('preview.found', { expenses: parsed.expenses.length, members: parsed.members.length })}
                </p>
                {totals.length > 0 && (
                    <p className="mt-1 text-sm text-n-1">{t('preview.total', { total: totals.join(' · ') })}</p>
                )}
                {drift?.length === 0 && (
                    <p className="mt-1 text-sm text-n-1" data-testid="import-balances-match">
                        {t('preview.balancesMatch')}
                    </p>
                )}
            </div>

            {parsedFile && parsedFile.choices.length > 1 && (
                <label className="flex flex-col gap-2">
                    <span className="text-h8 uppercase tracking-wide text-grey-1">{t('groups.label')}</span>
                    <select
                        value={choiceIndex}
                        onChange={(event) => {
                            const index = Number(event.target.value)
                            const choice = parsedFile.choices[index]
                            if (choice) applyChoice(choice, index, parsedFile.source)
                        }}
                        className="h-12 rounded-sm border border-n-1 bg-white px-3 text-base font-bold text-n-1 shadow-[2px_2px_0_#111] outline-none"
                        data-testid="import-group-choice"
                    >
                        {parsedFile.choices.map((choice, index) => (
                            <option key={choice.id} value={index}>
                                {choice.roomName}
                            </option>
                        ))}
                    </select>
                    <span className="text-sm text-grey-1">
                        {targetRoom ? t('groups.existingHint') : t('groups.hint')}
                    </span>
                </label>
            )}

            {parsedFile && parsedFile.skipped.length > 0 && (
                <div className="rounded-sm border border-n-1 bg-primary-1 p-4" data-testid="import-skipped-groups">
                    <h2 className="text-h7">{t('groups.skippedTitle')}</h2>
                    <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-5 text-n-1">
                        {parsedFile.skipped.map((choice, index) => (
                            <li key={`${choice.roomName}-${choice.reason}-${index}`}>{skippedChoiceMessage(choice)}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Louder than the warnings box, and above it: every other warning is about a row, this
                one is about the numbers people will argue over. */}
            {drift && drift.length > 0 && (
                <div className="rounded-sm border border-n-1 bg-primary-1 p-4" data-testid="import-balances-differ">
                    <h2 className="text-h7">{t('preview.balancesDifferTitle')}</h2>
                    <p className="mt-2 text-sm leading-5 text-n-1">
                        {t('preview.balancesDiffer', { count: drift.length })}
                    </p>
                    {/* The count was the whole message, which told somebody that
                        three balances were wrong and nothing about whose or by
                        how much — so the only way to find out was to import it
                        and compare two screens. The numbers are already computed;
                        printing them is what turns a warning into a decision. */}
                    <ul className="mt-3 flex flex-col gap-1" data-testid="import-drift-lines">
                        {drift.map((entry) => (
                            <li
                                key={entry.member}
                                data-testid="import-drift-line"
                                data-member={entry.member}
                                data-delta={entry.deltaMinor}
                                className="flex items-baseline justify-between gap-3 text-sm text-n-1"
                            >
                                <span className="min-w-0 truncate">{entry.member}</span>
                                <span className="shrink-0 tabular-nums">
                                    {t(entry.deltaMinor.startsWith('-') ? 'preview.driftShort' : 'preview.driftOver', {
                                        amount: formatMoney(
                                            entry.deltaMinor.replace('-', ''),
                                            parsed.suggestedCurrency,
                                            currencies,
                                            locale
                                        ),
                                    })}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {targetRoom ? (
                <div className="flex flex-col gap-3">
                    <div className="rounded-sm border border-n-1 bg-white p-4" data-testid="import-fixed-currency">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-h8 uppercase tracking-wide text-grey-1">
                                {tExisting('currencyLabel')}
                            </span>
                            <strong>{targetRoom.state.room.currency}</strong>
                        </div>
                        <p className="mt-2 text-sm leading-5 text-grey-1">
                            {tExisting('currencyHint', { currency: targetRoom.state.room.currency })}
                        </p>
                    </div>
                    <ExistingRoomImportCurrencyProblem
                        sourceCurrencies={unsupportedCurrencies}
                        roomCurrency={targetRoom.state.room.currency}
                    />
                </div>
            ) : (
                <>
                    <label className="flex flex-col gap-2">
                        <span className="text-h8 uppercase tracking-wide text-grey-1">{t('preview.roomName')}</span>
                        <BaseInput
                            value={roomName}
                            onChange={(event) => setRoomName(event.target.value)}
                            placeholder={t('preview.roomNamePlaceholder')}
                            maxLength={80}
                            data-testid="import-room-name"
                        />
                    </label>

                    <div className="flex flex-col gap-2">
                        <span className="text-h8 uppercase tracking-wide text-grey-1">{t('preview.currency')}</span>
                        <CurrencySelect
                            value={currency}
                            onChange={(code) => {
                                setCurrency(code)
                                setServerRateRejections({})
                                feedback('tick')
                            }}
                            currencies={currencies}
                            suggested={parsed.currencies}
                            // The room here has to be able to RECEIVE the file's currencies. An invented
                            // ticker converts nothing, so every row of the import would have to be dropped.
                            allowCustom={false}
                            aria-label={t('preview.currencyLabel')}
                            data-testid="import-currency"
                        />
                        <span className="text-sm text-grey-1">{t('preview.currencyHint')}</span>
                    </div>
                    <ExistingRoomImportCurrencyProblem
                        sourceCurrencies={unsupportedCurrencies}
                        roomCurrency={currency}
                    />
                </>
            )}

            {parsed.currencies.length > 1 && (
                <div className="rounded-sm border border-n-1 bg-primary-3 p-4">
                    <h2 className="text-h7">{t('fx.title')}</h2>
                    <p className="mt-2 text-sm leading-5 text-n-1">{t('fx.body')}</p>
                </div>
            )}

            {targetRoom ? (
                <ExistingRoomImportFields
                    roomName={targetRoom.state.room.name}
                    members={targetRoom.state.members}
                    drafts={memberDrafts}
                    onChange={(index, next) => {
                        const updated = [...memberDrafts]
                        updated[index] = next
                        setMemberDrafts(updated)
                    }}
                    problem={memberMappingProblemMessage(memberMappingProblem)}
                />
            ) : (
                <fieldset className="flex flex-col gap-3">
                    <legend className="text-h8 uppercase tracking-wide text-grey-1">{t('preview.members')}</legend>
                    <p className="text-sm leading-5 text-grey-1">{t('preview.whoAreYou')}</p>
                    {names.map((name, index) => (
                        <div key={parsed.members[index]} className="flex items-center gap-3">
                            <input
                                type="radio"
                                name="import-me"
                                checked={meIndex === index}
                                onChange={() => setMeIndex(index)}
                                aria-label={t('preview.thatsMe', { name })}
                                data-testid="import-me"
                                data-member={name}
                                className="size-5 shrink-0 accent-primary-1"
                            />
                            <BaseInput
                                variant="sm"
                                value={name}
                                maxLength={80}
                                onChange={(event) => {
                                    const next = [...names]
                                    next[index] = event.target.value
                                    setNames(next)
                                }}
                                data-testid="import-member-name"
                            />
                        </div>
                    ))}
                    {nameProblem && (
                        <p role="alert" className="text-sm font-bold text-error">
                            {nameProblem}
                        </p>
                    )}
                </fieldset>
            )}

            {parsed.warnings.length > 0 && (
                <div className="rounded-sm border border-n-1 bg-white p-4">
                    <h2 className="text-h7">{t('warnings.title')}</h2>
                    <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-5 text-grey-1">
                        {shownWarnings.map((warning, index) => (
                            <li key={`${warning.code}-${warning.row ?? index}`}>{warningMessage(warning)}</li>
                        ))}
                        {hiddenWarnings > 0 && <li>{t('warnings.more', { count: hiddenWarnings })}</li>}
                    </ul>
                </div>
            )}

            {error && (
                <p role="alert" className="text-sm font-bold text-error" data-testid="import-error">
                    {error}
                </p>
            )}

            <div className="flex flex-col gap-3">
                <Button
                    variant="primary"
                    shadowSize="4"
                    className="justify-center"
                    disabled={
                        targetRoom
                            ? !!memberMappingProblem ||
                              checkingRates ||
                              unsupportedCurrencies.length > 0 ||
                              importIntoRoom.isPending
                            : !roomName.trim() ||
                              !!nameProblem ||
                              meIndex === null ||
                              checkingRates ||
                              unsupportedCurrencies.length > 0 ||
                              importRoom.isPending
                    }
                    loading={targetRoom ? importIntoRoom.isPending : importRoom.isPending}
                    onClick={submit}
                    data-testid="import-submit"
                >
                    {targetRoom
                        ? tExisting('submit', {
                              count: parsed.expenses.length,
                              room: targetRoom.state.room.name,
                          })
                        : t('preview.submit')}
                </Button>
                <Button variant="stroke" className="justify-center" onClick={startOver}>
                    {t('preview.startOver')}
                </Button>
            </div>
        </motion.div>
    )
}
