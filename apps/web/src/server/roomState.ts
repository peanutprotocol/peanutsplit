/**
 * The RoomState envelope. Every mutation returns one of these so the client
 * seeds its cache in a single hop and never has to re-derive money client-side.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { ApiError, notFound } from '@/server/http'
import { formatStoredFxRate } from '@/server/money'
import type { ApiTransfer, RoomState } from '@/lib/api-types'

const roomArgs = {
    include: {
        members: { orderBy: { createdAt: 'asc' } },
        expenses: {
            where: { deletedAt: null },
            // Roster order, id as tiebreaker — wire order must be deterministic
            // (uuid PKs mean physical order is arbitrary and flaked in CI).
            include: {
                shares: { orderBy: [{ member: { createdAt: 'asc' } }, { id: 'asc' }] },
                // Reactions ride the expense: they are loaded through it, so a
                // soft-deleted expense takes its reactions off the wire with it,
                // and an undo brings them back untouched.
                reactions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
            },
            // Id last, for the same reason the two relations above carry one: a
            // bulk import writes five hundred rows in one `createMany` and every
            // one of them gets the same `createdAt` to the millisecond, so with
            // only date and createdAt the order falls through to heap position —
            // and an unrelated edit re-shuffles a room's whole history under the
            // reader. Uuids make it arbitrary, but arbitrary and STABLE.
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        },
        settlements: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
    },
} satisfies Prisma.RoomDefaultArgs

type BaseRoomWithRelations = Prisma.RoomGetPayload<typeof roomArgs>
type MemberWithRemovalState = BaseRoomWithRelations['members'][number] & { canRemove: boolean }

export type RoomWithRelations = Omit<BaseRoomWithRelations, 'members'> & {
    members: MemberWithRemovalState[]
}

/** True only for a roster-added name with no durable ledger reference. Device
 * selection never changes this cleanup decision. */
export const canRemoveMember = (member: MemberWithRemovalState): boolean => member.provisional && member.canRemove

/**
 * The columns a balance is folded from, and nothing else.
 *
 * Structural rather than `RoomWithRelations` so a caller that selected four
 * columns — the recap card does exactly that, and loading every share to draw an
 * unfurl would be absurd — can use THIS fold instead of writing a second one.
 * `RoomWithRelations` satisfies it, so every existing call site is unchanged.
 */
export interface BalanceInput {
    members: readonly { id: string }[]
    expenses: readonly {
        paidById: string
        baseAmountMinor: bigint
        shares: readonly { memberId: string; amountMinor: bigint }[]
    }[]
    settlements: readonly { fromId: string; toId: string; amountMinor: bigint }[]
}

/** Net position per member: what they paid out, minus their share of everything,
 *  adjusted by settlements already recorded. Sums to zero by construction.
 *
 *  THE definition of a balance in this product. There is no second one. */
export function balancesOf(room: BalanceInput): Map<string, bigint> {
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
            theme: room.theme,
            createdAt: room.createdAt.toISOString(),
            archivedAt: room.archivedAt?.toISOString() ?? null,
        },
        members: room.members.map((m) => ({
            id: m.id,
            name: m.name,
            avatar: m.avatar,
            avatarPalette: m.avatarPalette,
            createdAt: m.createdAt.toISOString(),
            canRemove: m.canRemove,
        })),
        expenses: room.expenses.map((e) => ({
            id: e.id,
            description: e.description,
            amountMinor: e.amountMinor.toString(),
            currency: e.currency,
            baseAmountMinor: e.baseAmountMinor.toString(),
            fxRate: formatStoredFxRate(e.fxRate),
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
                splitWeight: s.splitWeight?.toString() ?? null,
            })),
            // Flat rows, grouped into pills client-side — the count and the
            // "did I react" flag are a rendering decision, not a wire fact.
            reactions: e.reactions.map((r) => ({ emoji: r.emoji, memberId: r.memberId })),
        })),
        settlements: room.settlements.map((s) => ({
            id: s.id,
            fromId: s.fromId,
            toId: s.toId,
            createdById: s.createdById,
            amountMinor: s.amountMinor.toString(),
            method: s.method,
            note: s.note,
            receiptUrl: s.receiptUrl,
            createdAt: s.createdAt.toISOString(),
        })),
        balances: Object.fromEntries([...balances.entries()].map(([id, net]) => [id, net.toString()])),
        suggestedTransfers: suggestedTransfers(balances),
    }
}

type RoomReader = Pick<Prisma.TransactionClient, 'room' | 'member'>

/**
 * Count history separately from the room read. Adding `_count` to the ordered
 * member relation changes PostgreSQL's query plan and made equal-timestamp
 * imported rosters reorder themselves. A second query only for roster-added
 * names keeps roster order stable and still counts soft-deleted history.
 */
async function withRemovalState(room: BaseRoomWithRelations, db: RoomReader): Promise<RoomWithRelations> {
    const provisionalIds = room.members.filter((member) => member.provisional).map((member) => member.id)
    if (provisionalIds.length === 0) {
        return {
            ...room,
            members: room.members.map((member) => ({ ...member, canRemove: false })),
        }
    }

    const histories = await db.member.findMany({
        where: { id: { in: provisionalIds } },
        select: { id: true, _count: true },
    })
    const removable = new Set(
        histories
            .filter(
                ({ _count }) =>
                    _count.paidExpenses === 0 &&
                    _count.createdExpenses === 0 &&
                    _count.shares === 0 &&
                    _count.reactions === 0 &&
                    _count.settlementsFrom === 0 &&
                    _count.settlementsTo === 0 &&
                    _count.createdSettlements === 0 &&
                    _count.pushSubscriptions === 0
            )
            .map(({ id }) => id)
    )
    return {
        ...room,
        members: room.members.map((member) => ({
            ...member,
            canRemove: removable.has(member.id),
        })),
    }
}

export async function loadRoom(slug: string, db: RoomReader = prisma): Promise<RoomWithRelations> {
    const room = await db.room.findUnique({ where: { slug }, ...roomArgs })
    if (!room) throw notFound('room not found')
    return withRemovalState(room, db)
}

export async function loadRoomById(id: string): Promise<RoomWithRelations> {
    const room = await prisma.room.findUnique({ where: { id }, ...roomArgs })
    if (!room) throw notFound('room not found')
    return withRemovalState(room, prisma)
}

export const roomStateBySlug = async (slug: string): Promise<RoomState> => toRoomState(await loadRoom(slug))

/** The member a request is acting as, per `X-Member-Token`. Attribution only. */
export function memberIdForToken(room: RoomWithRelations, token: string | null): string | null {
    if (!token) return null
    return room.members.find((m) => m.token === token)?.id ?? null
}

/**
 * The token as PROOF rather than attribution — the gate for the handful of
 * writes that a bare link-holder must not be able to make on somebody else's
 * behalf (a push channel bound to a phone, a reaction signed with a name).
 *
 * Lives here beside `memberIdForToken` so the two readings of the same token sit
 * next to each other and nobody reaches for the wrong one.
 */
export function assertProvenMember(room: RoomWithRelations, memberId: string, memberToken: string): void {
    const member = room.members.find((m) => m.id === memberId)
    if (!member || member.token !== memberToken) {
        throw new ApiError(403, 'MEMBER_TOKEN_INVALID', 'this device is not signed in as a member of this room')
    }
}
