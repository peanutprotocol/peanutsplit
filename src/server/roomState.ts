/**
 * The RoomState envelope. Every mutation returns one of these so the client
 * seeds its cache in a single hop and never has to re-derive money client-side.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { notFound } from '@/server/http'
import type { ApiTransfer, RoomState } from '@/lib/api-types'

const roomArgs = {
    include: {
        members: { orderBy: { createdAt: 'asc' } },
        expenses: {
            where: { deletedAt: null },
            include: { shares: true },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        },
        settlements: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
    },
} satisfies Prisma.RoomDefaultArgs

export type RoomWithRelations = Prisma.RoomGetPayload<typeof roomArgs>

/** Net position per member: what they paid out, minus their share of everything,
 *  adjusted by settlements already recorded. Sums to zero by construction. */
export function balancesOf(room: RoomWithRelations): Map<string, bigint> {
    const net = new Map<string, bigint>(room.members.map((m) => [m.id, 0n]))
    const bump = (id: string, delta: bigint) => {
        const current = net.get(id)
        if (current !== undefined) net.set(id, current + delta)
    }

    for (const expense of room.expenses) {
        bump(expense.paidById, expense.baseAmountMinor)
        for (const share of expense.shares) bump(share.memberId, -share.amountMinor)
    }
    for (const settlement of room.settlements) {
        bump(settlement.fromId, settlement.amountMinor)
        bump(settlement.toId, -settlement.amountMinor)
    }
    return net
}

/** Greedy debt simplification: settle the biggest debtor against the biggest
 *  creditor, repeatedly. At most n-1 transfers, and they zero every balance. */
export function suggestedTransfers(balances: Map<string, bigint>): ApiTransfer[] {
    const byAmountThenId = (a: { id: string; amount: bigint }, b: { id: string; amount: bigint }) =>
        a.amount === b.amount ? a.id.localeCompare(b.id) : a.amount > b.amount ? -1 : 1

    const entries = [...balances.entries()].map(([id, amount]) => ({ id, amount }))
    const debtors = entries
        .filter((e) => e.amount < 0n)
        .map((e) => ({ id: e.id, amount: -e.amount }))
        .sort(byAmountThenId)
    const creditors = entries
        .filter((e) => e.amount > 0n)
        .map((e) => ({ id: e.id, amount: e.amount }))
        .sort(byAmountThenId)

    const out: ApiTransfer[] = []
    let i = 0
    let j = 0
    while (i < debtors.length && j < creditors.length) {
        const pay = debtors[i].amount < creditors[j].amount ? debtors[i].amount : creditors[j].amount
        if (pay > 0n) out.push({ fromId: debtors[i].id, toId: creditors[j].id, amountMinor: pay.toString() })
        debtors[i].amount -= pay
        creditors[j].amount -= pay
        if (debtors[i].amount === 0n) i++
        if (creditors[j].amount === 0n) j++
    }
    return out
}

/** DB rows → wire shape. BigInt becomes a decimal string here, not later. */
export function toRoomState(room: RoomWithRelations): RoomState {
    const balances = balancesOf(room)
    return {
        room: {
            id: room.id,
            slug: room.slug,
            name: room.name,
            emoji: room.emoji,
            currency: room.currency,
            coverUrl: room.coverUrl,
            createdAt: room.createdAt.toISOString(),
            archivedAt: room.archivedAt?.toISOString() ?? null,
        },
        members: room.members.map((m) => ({ id: m.id, name: m.name, createdAt: m.createdAt.toISOString() })),
        expenses: room.expenses.map((e) => ({
            id: e.id,
            description: e.description,
            amountMinor: e.amountMinor.toString(),
            currency: e.currency,
            baseAmountMinor: e.baseAmountMinor.toString(),
            fxRate: e.fxRate.toString(),
            splitMode: e.splitMode,
            paidById: e.paidById,
            createdById: e.createdById,
            date: e.date.toISOString(),
            category: e.category,
            createdAt: e.createdAt.toISOString(),
            shares: e.shares.map((s) => ({
                memberId: s.memberId,
                amountMinor: s.amountMinor.toString(),
                enteredAmountMinor: s.enteredAmountMinor?.toString() ?? null,
            })),
        })),
        settlements: room.settlements.map((s) => ({
            id: s.id,
            fromId: s.fromId,
            toId: s.toId,
            createdById: s.createdById,
            amountMinor: s.amountMinor.toString(),
            method: s.method,
            note: s.note,
            createdAt: s.createdAt.toISOString(),
        })),
        balances: Object.fromEntries([...balances.entries()].map(([id, net]) => [id, net.toString()])),
        suggestedTransfers: suggestedTransfers(balances),
    }
}

export async function loadRoom(slug: string): Promise<RoomWithRelations> {
    const room = await prisma.room.findUnique({ where: { slug }, ...roomArgs })
    if (!room) throw notFound('room not found')
    return room
}

export async function loadRoomById(id: string): Promise<RoomWithRelations> {
    const room = await prisma.room.findUnique({ where: { id }, ...roomArgs })
    if (!room) throw notFound('room not found')
    return room
}

export const roomStateBySlug = async (slug: string): Promise<RoomState> => toRoomState(await loadRoom(slug))

/** The member a request is acting as, per `X-Member-Token`. Attribution only. */
export function memberIdForToken(room: RoomWithRelations, token: string | null): string | null {
    if (!token) return null
    return room.members.find((m) => m.token === token)?.id ?? null
}
