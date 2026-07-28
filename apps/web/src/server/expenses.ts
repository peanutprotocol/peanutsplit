/** Turning an expense request into rows: FX, share maths, and the invariants
 *  that keep balances honest. Shared by POST and PATCH so an edit behaves
 *  exactly like a fresh write. */
import { getRateTable, rateFrom } from '@/server/fx'
import { badRequest } from '@/server/http'
import { convertMinorAtRate, parseMinor } from '@/server/money'
import { equalShares, exactShares, sumShares, type ShareDraft } from '@/server/split'
import type { RoomWithRelations } from '@/server/roomState'
import type { ExpenseBody } from '@/server/validation'

export interface ExpenseWrite {
    description: string
    amountMinor: bigint
    currency: string
    baseAmountMinor: bigint
    fxRate: string
    paidById: string
    splitMode: 'EQUAL' | 'EXACT'
    date: Date
    category: string | null
    shares: ShareDraft[]
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

export async function buildExpense(
    room: RoomWithRelations,
    body: ExpenseBody,
    existing?: { date: Date }
): Promise<ExpenseWrite> {
    const total = parseMinor(body.amountMinor)
    if (total <= 0n) throw badRequest('amount must be greater than zero', 'AMOUNT_NOT_POSITIVE')
    requireMember(room, body.paidById, 'payer')

    const rate = rateFrom(await getRateTable(), body.currency, room.currency)
    const baseAmountMinor = convertMinorAtRate(total, body.currency, room.currency, rate)

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
        fxRate: rate.toFixed(12),
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
