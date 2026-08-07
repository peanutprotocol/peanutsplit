/** Turning an expense request into rows: FX, share maths, and the invariants
 *  that keep balances honest. Shared by POST and PATCH so an edit behaves
 *  exactly like a fresh write. */
import type { Expense, Prisma } from '@prisma/client'
import type { SplitMode } from '@/lib/api-types'
import { getRateTable, requireRate, type RateTable } from '@/server/fx'
import { catchUpUndoSharesFromAudit } from '@/server/history'
import { badRequest, conflict, notFound } from '@/server/http'
import {
    convertMinorAtManualFxRate,
    convertMinorAtRate,
    formatStoredFxRate,
    FX_RATE_DIGITS,
    isCatalogCode,
    MAX_SIGNED_MINOR,
    parseManualFxRate,
    parseMinor,
    quantiseRate,
    type ManualFxRate,
} from '@/server/money'
import {
    equalShares,
    exactShares,
    sumShares,
    weightedShares as apportionWeightedShares,
    type ShareDraft,
} from '@/server/split'
import type { RoomWithRelations } from '@/server/roomState'
import type { CatchUpExpenseBody, ExpenseBody } from '@/server/validation'
import { activeMembers, isFormerMember } from '@/lib/members'

export interface ExpenseWrite {
    description: string
    amountMinor: bigint
    currency: string
    baseAmountMinor: bigint
    fxRate: string
    paidById: string
    splitMode: SplitMode
    date: Date
    category: string | null
    shares: ShareDraft[]
}

/**
 * Permanently mark the first expense that creates money between two people.
 * Every caller already owns the room write lock, so the nullable marker is an
 * immutable latch rather than a race between different write surfaces.
 */
export async function latchFirstSharedBalance(
    tx: Pick<Prisma.TransactionClient, 'room'>,
    room: Pick<RoomWithRelations, 'id' | 'firstSharedBalanceExpenseId'>,
    expenseId: string,
    paidById: string,
    shares: readonly Pick<ShareDraft, 'memberId' | 'amountMinor'>[]
): Promise<boolean> {
    const activates = shares.some((share) => share.memberId !== paidById && share.amountMinor > 0n)
    if (room.firstSharedBalanceExpenseId !== null || !activates) return false
    await tx.room.update({ where: { id: room.id }, data: { firstSharedBalanceExpenseId: expenseId } })
    return true
}

/**
 * Add or remove exactly one late member on an EQUAL expense while the caller
 * owns the room's advisory transaction lock. Remove is the conflict-safe,
 * in-session Undo for the add command.
 *
 * A normal expense PATCH is intentionally the wrong primitive here: it replaces
 * the whole row and all shares from a client copy, so two people catching up at
 * once can erase each other. This command reads the authoritative participants
 * under the lock, checks that they are the set the review showed, then appends
 * the target. No descriptive, payer, date, category, amount, currency, or FX
 * column is rewritten.
 *
 * `false` means the requested end state already exists. That is a successful
 * no-op so a commit followed by a lost HTTP response is safe to retry.
 */
export async function changeEqualExpenseParticipant(
    tx: Prisma.TransactionClient,
    room: RoomWithRelations,
    expenseId: string,
    body: CatchUpExpenseBody
): Promise<boolean> {
    const member = room.members.find((candidate) => candidate.id === body.memberId)
    if (!member) throw badRequest('participant is not a member of this room', 'NOT_A_MEMBER')
    if (body.action === 'add' && isFormerMember(member)) {
        throw conflict('a former member cannot be added to an expense', 'MEMBER_FORMER')
    }

    const expense = await tx.expense.findFirst({
        where: { id: expenseId, roomId: room.id },
        include: { shares: { orderBy: [{ member: { createdAt: 'asc' } }, { id: 'asc' }] } },
    })
    if (!expense) throw notFound('expense not found', 'EXPENSE_NOT_FOUND')
    if (expense.deletedAt) throw conflict('restore this expense before editing it', 'EXPENSE_DELETED')
    if (expense.splitMode !== 'EQUAL') {
        throw conflict('the expense is no longer an equal split — review it again', 'CATCH_UP_REVIEW_CONFLICT')
    }
    if (expense.createdAt.getTime() >= member.createdAt.getTime()) {
        throw conflict('the expense is not from before this member joined', 'CATCH_UP_REVIEW_CONFLICT')
    }

    const participantIds = expense.shares.map((share) => share.memberId)

    // Idempotency precedes the snapshot guard. The only effect this command is
    // meant to achieve already exists, so a retry must not fail merely because
    // another catch-up has since appended a second person. This branch writes
    // nothing and therefore cannot accept a stale impact on somebody's behalf.
    const alreadyIncluded = participantIds.includes(body.memberId)
    if ((body.action === 'add' && alreadyIncluded) || (body.action === 'remove' && !alreadyIncluded)) return false

    const expected = new Set(body.expectedParticipantIds)
    const participantsMatch =
        expected.size === participantIds.length && participantIds.every((memberId) => expected.has(memberId))
    if (
        expense.description !== body.expectedDescription ||
        expense.amountMinor.toString() !== body.expectedAmountMinor ||
        expense.baseAmountMinor.toString() !== body.expectedBaseAmountMinor ||
        expense.currency !== body.expectedCurrency ||
        formatStoredFxRate(expense.fxRate) !== body.expectedFxRate ||
        expense.paidById !== body.expectedPaidById ||
        expense.date.toISOString() !== new Date(body.expectedDate).toISOString() ||
        expense.category !== body.expectedCategory ||
        !participantsMatch
    ) {
        throw conflict('the expense changed after review — review it again', 'CATCH_UP_REVIEW_CONFLICT')
    }

    // Rebuilding is one transaction under the room lock. It uses the current
    // participant rows plus the target, never the client-provided snapshot, so
    // this operation cannot drop a person even if that snapshot was reordered.
    const nextParticipantIds =
        body.action === 'add'
            ? [...participantIds, body.memberId]
            : participantIds.filter((memberId) => memberId !== body.memberId)
    if (nextParticipantIds.length === 0) {
        throw conflict('an equal expense must keep at least one participant', 'CATCH_UP_REVIEW_CONFLICT')
    }
    const shares =
        body.action === 'add'
            ? equalShares(expense.baseAmountMinor, nextParticipantIds)
            : await catchUpUndoSharesFromAudit(tx, expense, body.memberId)
    if (!shares) {
        throw conflict('the original equal shares can no longer be restored safely', 'CATCH_UP_REVIEW_CONFLICT')
    }
    const restoredIds = new Set(shares.map((share) => share.memberId))
    if (
        restoredIds.size !== nextParticipantIds.length ||
        !nextParticipantIds.every((memberId) => restoredIds.has(memberId)) ||
        shares.some((share) => !room.members.some((candidate) => candidate.id === share.memberId))
    ) {
        throw conflict('the original equal shares can no longer be restored safely', 'CATCH_UP_REVIEW_CONFLICT')
    }
    await tx.expenseShare.deleteMany({ where: { expenseId } })
    await tx.expenseShare.createMany({ data: shares.map((share) => ({ expenseId, ...share })) })
    return true
}

/**
 * `label` stays in the English message for whoever reads the log; the CODE is what the client
 * translates, and it is the same one for payer, participant and share member on purpose — the
 * user-facing sentence is identical and three codes would be three catalog entries saying it.
 */
const requireMember = (
    room: RoomWithRelations,
    id: string,
    label: string,
    allowedFormerIds: ReadonlySet<string> = new Set()
): string => {
    const member = room.members.find((candidate) => candidate.id === id)
    if (!member) throw badRequest(`${label} is not a member of this room`, 'NOT_A_MEMBER')
    if (isFormerMember(member) && !allowedFormerIds.has(id)) {
        throw badRequest(`${label} is a former member and cannot be added to new activity`, 'MEMBER_FORMER')
    }
    return id
}

/** The row an edit is rewriting. `currency` + `fxRate` are what keep the rate locked at creation;
 *  `amountMinor` + `baseAmountMinor` are what let an edit that does not touch the money carry the
 *  stored total forward instead of converting it again; `date` is reused when the body omits one. */
export type ExistingExpense = Pick<Expense, 'date' | 'currency' | 'fxRate' | 'amountMinor' | 'baseAmountMinor'> & {
    /** Present on route-backed edits. Optional keeps the pure FX helpers small. */
    paidById?: string
    shares?: readonly { memberId: string }[]
}

/**
 * Whether a write needs a fresh catalog table before it takes the room lock.
 *
 * Same-pair edits already have their frozen rate, identity pairs are 1, and an
 * invented pair must use the explicit manual contract. Keeping this predicate
 * beside `buildExpense` stops route handlers from waking the remote/cache path
 * for writes that cannot use its answer.
 */
export function expenseNeedsRateTable(
    roomCurrency: string,
    expenseCurrency: string,
    existingCurrency?: string,
    manualFxRate?: string
): boolean {
    if (manualFxRate !== undefined) return false
    if (existingCurrency === expenseCurrency || expenseCurrency === roomCurrency) return false
    return isCatalogCode(expenseCurrency) && isCatalogCode(roomCurrency)
}

export async function buildExpense(
    room: RoomWithRelations,
    body: ExpenseBody & { paidById: string },
    existing?: ExistingExpense,
    /** A table the caller already holds. The importer builds hundreds of expenses in one pass and
     *  must not re-read FX per row — one query per import, not one per expense. Omitted everywhere
     *  else, where a single write can afford to fetch its own. */
    rateTable?: RateTable
): Promise<ExpenseWrite> {
    assertSplitPayloadMatchesMode(body)
    const total = parseMinor(body.amountMinor)
    if (total <= 0n) throw badRequest('amount must be greater than zero', 'AMOUNT_NOT_POSITIVE')
    // Historical edits may preserve the Former identities already on THIS row,
    // but may never introduce a different Former payer or participant.
    const existingPayerIds = new Set(existing?.paidById ? [existing.paidById] : [])
    const existingParticipantIds = new Set((existing?.shares ?? []).map((share) => share.memberId))
    requireMember(room, body.paidById, 'payer', existingPayerIds)

    // The rate is locked at creation (schema.prisma says so, and history depends
    // on it). Re-reading the table on every edit would silently re-price a
    // foreign-currency expense — fixing a typo in the description would move
    // everyone's balance the day live FX lands. Only a currency change earns a
    // fresh rate, because the stored one no longer describes the pair.
    //
    // The `??` also keeps the quote LAZY, which is now load-bearing: editing the description of
    // an old expense whose pair has since lost its rate must not start failing with NO_RATE.
    //
    // A fresh quote is rounded to the column's 12 digits BEFORE it converts anything, so the rate
    // that priced the expense IS the rate in the column. Converting at the full precision of the
    // quote and storing a rounded copy of it made a create and an edit two different sums:
    // `RATE_SCALE` is finer than the column, so the two disagree on about 0.5% of realistic
    // amounts by one minor unit, and the direction is unpredictable.
    const samePair = existing !== undefined && existing.currency === body.currency
    const customPair = !isCatalogCode(body.currency) && body.currency !== room.currency
    const lockedManualRate =
        samePair && customPair && existing ? parseManualFxRate(formatStoredFxRate(existing.fxRate)) : null
    const lockedRate = samePair && !customPair && existing ? quantiseRate(Number(existing.fxRate)) : null
    const suppliedManualRate = body.manualFxRate === undefined ? null : parseManualFxRate(body.manualFxRate)

    // A manual rate is an explicit valuation of an invented unit, not a second
    // way to quote real money. Refusing it on catalog and identity pairs keeps a
    // stale form field from silently overriding the feed (or turning 1 BEER
    // into something other than 1 BEER inside a BEER room).
    if (body.manualFxRate !== undefined && !customPair) {
        throw badRequest(
            'a manual exchange rate is only allowed for an invented expense currency',
            'MANUAL_FX_RATE_NOT_ALLOWED'
        )
    }
    if (body.manualFxRate !== undefined && suppliedManualRate === null) {
        throw badRequest('manual exchange rate is invalid', 'MANUAL_FX_RATE_INVALID')
    }

    let manualRate: ManualFxRate | null = null
    let rate: number | null = null
    if (customPair) {
        // A same-pair edit may omit the field: the existing column is the frozen
        // agreement. A create or currency change has no such agreement and must
        // carry one explicitly. Never consult RateTable for an invented code,
        // even if a malformed or stale cache happened to contain it.
        if (suppliedManualRate !== null) manualRate = suppliedManualRate
        else if (lockedManualRate !== null) manualRate = lockedManualRate
        else {
            throw badRequest(
                `a manual exchange rate is required for ${body.currency} → ${room.currency}`,
                'MANUAL_FX_RATE_REQUIRED'
            )
        }
    } else {
        if (lockedRate !== null) rate = lockedRate
        else if (body.currency === room.currency) rate = 1
        else if (!isCatalogCode(room.currency)) {
            // A catalog expense cannot be priced into an invented room unit,
            // and its catalog status means a manual override is forbidden.
            throw badRequest(`no exchange rate for ${body.currency} → ${room.currency}`, 'NO_RATE')
        } else {
            rate = quantiseRate(
                requireRate(rateTable ?? (await getRateTable(room.currency)), body.currency, room.currency)
            )
        }
    }
    // A rate below 5e-13 rounds to zero in the column, and a zero rate converts the whole expense
    // to nothing. The smallest cross rate the feed can produce is about 3e-7, so this is a cliff
    // nothing reaches — but converting money at a rate the ledger cannot hold has to be a refusal
    // rather than a silent zero.
    if (!customPair && !(rate !== null && rate > 0)) {
        throw badRequest(`no exchange rate for ${body.currency} → ${room.currency}`, 'NO_RATE')
    }

    // An edit that leaves the amount and the currency alone carries the stored total forward
    // rather than converting again. Converting again is what let a description-only PATCH move a
    // balance, and it is also what rewrote every row written at the old 9dp rate scale by a minor
    // unit the first time anybody touched it. The stored total is the room's history: only a
    // change to the money it describes may replace it. The room currency cannot change, so the
    // total still means what it meant when it was written.
    const rateUnchanged = customPair
        ? lockedManualRate !== null && manualRate !== null && manualRate.scaled === lockedManualRate.scaled
        : lockedRate !== null && rate === lockedRate
    const moneyUnchanged = existing !== undefined && samePair && existing.amountMinor === total && rateUnchanged
    const baseAmountMinor = moneyUnchanged
        ? existing.baseAmountMinor
        : customPair
          ? convertMinorAtManualFxRate(total, body.currency, room.currency, manualRate!)
          : convertMinorAtRate(total, body.currency, room.currency, rate!)
    if (customPair && baseAmountMinor === 0n) {
        throw badRequest(
            'manual exchange rate is too small for this amount; it converts to zero in the room currency',
            'MANUAL_FX_RATE_INVALID'
        )
    }
    if (baseAmountMinor > MAX_SIGNED_MINOR)
        throw badRequest('converted amount is too large to store', 'AMOUNT_TOO_LARGE')

    let shares: ShareDraft[]
    if (body.splitMode === 'EXACT') {
        const entered = body.exactShares ?? []
        if (entered.length === 0)
            throw badRequest('exactShares is required for an EXACT split', 'EXACT_SHARES_REQUIRED')
        assertNoDuplicates(entered.map((s) => s.memberId))
        entered.forEach((s) => requireMember(room, s.memberId, 'share member', existingParticipantIds))
        const parsed = entered.map((s) => ({ memberId: s.memberId, amountMinor: parseMinor(s.amountMinor) }))
        const sum = parsed.reduce((a, s) => a + s.amountMinor, 0n)
        if (sum !== total) throw badRequest('exact shares must add up to the expense total', 'SHARES_DO_NOT_ADD_UP')
        shares = exactShares(parsed, body.currency, room.currency, baseAmountMinor, customPair ? manualRate! : rate!)
    } else if (body.splitMode === 'PERCENTAGE' || body.splitMode === 'SHARES') {
        const entered = body.weightedShares ?? []
        if (entered.length === 0)
            throw badRequest('weightedShares is required for a weighted split', 'WEIGHTED_SHARES_REQUIRED')
        assertNoDuplicates(entered.map((share) => share.memberId))
        entered.forEach((share) => requireMember(room, share.memberId, 'share member', existingParticipantIds))
        const parsed = entered.map((share) => ({ memberId: share.memberId, weight: parseMinor(share.weight) }))
        if (parsed.some((share) => share.weight <= 0n))
            throw badRequest('split weights must be greater than zero', 'SPLIT_WEIGHT_NOT_POSITIVE')
        if (body.splitMode === 'PERCENTAGE' && parsed.reduce((sum, share) => sum + share.weight, 0n) !== 10_000n)
            throw badRequest('percentage shares must add up to 100%', 'PERCENTAGES_DO_NOT_ADD_UP')
        shares = apportionWeightedShares(baseAmountMinor, parsed)
    } else {
        const ids = body.participantIds?.length ? body.participantIds : activeMembers(room.members).map((m) => m.id)
        if (ids.length === 0) throw badRequest('an expense needs at least one participant', 'NO_PARTICIPANTS')
        assertNoDuplicates(ids)
        ids.forEach((id) => requireMember(room, id, 'participant', existingParticipantIds))
        shares = equalShares(baseAmountMinor, ids)
    }

    // Balances only net to zero if the shares reconstruct the room-currency total.
    if (sumShares(shares) !== baseAmountMinor) throw new Error('share maths did not reconcile to the expense total')

    return {
        description: body.description,
        amountMinor: total,
        currency: body.currency,
        baseAmountMinor,
        fxRate: customPair ? manualRate!.decimal : rate!.toFixed(FX_RATE_DIGITS),
        paidById: body.paidById,
        splitMode: body.splitMode,
        date: body.date ? new Date(body.date) : (existing?.date ?? new Date()),
        category: body.category?.trim() ? body.category.trim() : null,
        shares,
    }
}

function assertNoDuplicates(ids: readonly string[]): void {
    if (new Set(ids).size !== ids.length)
        throw badRequest('a member can only appear once in a split', 'DUPLICATE_PARTICIPANT')
}

function assertSplitPayloadMatchesMode(body: ExpenseBody): void {
    const mismatched =
        body.splitMode === 'EQUAL'
            ? body.exactShares !== undefined || body.weightedShares !== undefined
            : body.splitMode === 'EXACT'
              ? body.participantIds !== undefined || body.weightedShares !== undefined
              : body.participantIds !== undefined || body.exactShares !== undefined
    if (mismatched) throw badRequest('split fields do not match splitMode', 'SPLIT_FIELDS_DO_NOT_MATCH_MODE')
}
