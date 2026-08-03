/** Turning an expense request into rows: FX, share maths, and the invariants
 *  that keep balances honest. Shared by POST and PATCH so an edit behaves
 *  exactly like a fresh write. */
import type { Expense, Prisma } from '@prisma/client'
import type { SplitMode } from '@/lib/api-types'
import { getRateTable, requireRate, type RateTable } from '@/server/fx'
import { catchUpUndoSharesFromAudit } from '@/server/history'
import { badRequest, conflict, notFound } from '@/server/http'
import { convertMinorAtRate, FX_RATE_DIGITS, MAX_SIGNED_MINOR, parseMinor, quantiseRate } from '@/server/money'
import {
    equalShares,
    exactShares,
    sumShares,
    weightedShares as apportionWeightedShares,
    type ShareDraft,
} from '@/server/split'
import type { RoomWithRelations } from '@/server/roomState'
import type { CatchUpExpenseBody, ExpenseBody } from '@/server/validation'

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
        expense.fxRate.toString() !== body.expectedFxRate ||
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
const requireMember = (room: RoomWithRelations, id: string, label: string): string => {
    if (!room.members.some((m) => m.id === id))
        throw badRequest(`${label} is not a member of this room`, 'NOT_A_MEMBER')
    return id
}

/** The row an edit is rewriting. `currency` + `fxRate` are what keep the rate locked at creation;
 *  `amountMinor` + `baseAmountMinor` are what let an edit that does not touch the money carry the
 *  stored total forward instead of converting it again; `date` is reused when the body omits one. */
export type ExistingExpense = Pick<Expense, 'date' | 'currency' | 'fxRate' | 'amountMinor' | 'baseAmountMinor'>

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
    requireMember(room, body.paidById, 'payer')

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
    const lockedRate = existing && existing.currency === body.currency ? quantiseRate(Number(existing.fxRate)) : null
    const rate =
        lockedRate ?? quantiseRate(requireRate(rateTable ?? (await getRateTable()), body.currency, room.currency))
    // A rate below 5e-13 rounds to zero in the column, and a zero rate converts the whole expense
    // to nothing. The smallest cross rate the feed can produce is about 3e-7, so this is a cliff
    // nothing reaches — but converting money at a rate the ledger cannot hold has to be a refusal
    // rather than a silent zero.
    if (!(rate > 0)) throw badRequest(`no exchange rate for ${body.currency} → ${room.currency}`, 'NO_RATE')

    // An edit that leaves the amount and the currency alone carries the stored total forward
    // rather than converting again. Converting again is what let a description-only PATCH move a
    // balance, and it is also what rewrote every row written at the old 9dp rate scale by a minor
    // unit the first time anybody touched it. The stored total is the room's history: only a
    // change to the money it describes may replace it. The room currency cannot change, so the
    // total still means what it meant when it was written.
    const moneyUnchanged = existing !== undefined && lockedRate !== null && existing.amountMinor === total
    const baseAmountMinor = moneyUnchanged
        ? existing.baseAmountMinor
        : convertMinorAtRate(total, body.currency, room.currency, rate)
    if (baseAmountMinor > MAX_SIGNED_MINOR)
        throw badRequest('converted amount is too large to store', 'AMOUNT_TOO_LARGE')

    let shares: ShareDraft[]
    if (body.splitMode === 'EXACT') {
        const entered = body.exactShares ?? []
        if (entered.length === 0)
            throw badRequest('exactShares is required for an EXACT split', 'EXACT_SHARES_REQUIRED')
        assertNoDuplicates(entered.map((s) => s.memberId))
        entered.forEach((s) => requireMember(room, s.memberId, 'share member'))
        const parsed = entered.map((s) => ({ memberId: s.memberId, amountMinor: parseMinor(s.amountMinor) }))
        const sum = parsed.reduce((a, s) => a + s.amountMinor, 0n)
        if (sum !== total) throw badRequest('exact shares must add up to the expense total', 'SHARES_DO_NOT_ADD_UP')
        shares = exactShares(parsed, body.currency, room.currency, baseAmountMinor, rate)
    } else if (body.splitMode === 'PERCENTAGE' || body.splitMode === 'SHARES') {
        const entered = body.weightedShares ?? []
        if (entered.length === 0)
            throw badRequest('weightedShares is required for a weighted split', 'WEIGHTED_SHARES_REQUIRED')
        assertNoDuplicates(entered.map((share) => share.memberId))
        entered.forEach((share) => requireMember(room, share.memberId, 'share member'))
        const parsed = entered.map((share) => ({ memberId: share.memberId, weight: parseMinor(share.weight) }))
        if (parsed.some((share) => share.weight <= 0n))
            throw badRequest('split weights must be greater than zero', 'SPLIT_WEIGHT_NOT_POSITIVE')
        if (body.splitMode === 'PERCENTAGE' && parsed.reduce((sum, share) => sum + share.weight, 0n) !== 10_000n)
            throw badRequest('percentage shares must add up to 100%', 'PERCENTAGES_DO_NOT_ADD_UP')
        shares = apportionWeightedShares(baseAmountMinor, parsed)
    } else {
        const ids = body.participantIds?.length ? body.participantIds : room.members.map((m) => m.id)
        if (ids.length === 0) throw badRequest('an expense needs at least one participant', 'NO_PARTICIPANTS')
        assertNoDuplicates(ids)
        ids.forEach((id) => requireMember(room, id, 'participant'))
        shares = equalShares(baseAmountMinor, ids)
    }

    // Balances only net to zero if the shares reconstruct the room-currency total.
    if (sumShares(shares) !== baseAmountMinor) throw new Error('share maths did not reconcile to the expense total')

    return {
        description: body.description,
        amountMinor: total,
        currency: body.currency,
        baseAmountMinor,
        fxRate: rate.toFixed(FX_RATE_DIGITS),
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
