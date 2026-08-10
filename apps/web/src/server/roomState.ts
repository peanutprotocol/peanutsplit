/**
 * The RoomState envelope. Every mutation returns one of these so the client
 * seeds its cache in a single hop and never has to re-derive money client-side.
 */
import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { ApiError, notFound } from '@/server/http'
import { formatStoredFxRate } from '@/server/money'
import { suggestedTransfers } from '@/server/settlement'
import type { RoomState } from '@/lib/api-types'
import { safePersonNameForDisplay } from '@/lib/person-name'
import { activeMember, activeMembers, isActiveMember } from '@/lib/members'

export { EXACT_SETTLEMENT_MAX_NONZERO_BALANCES, suggestedTransfers } from '@/server/settlement'

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
            // Id last, for the same reason the two relations above carry one:
            // legacy bulk imports and concurrent ordinary writes can share a
            // `createdAt` millisecond. Without a final key, ties fall through to
            // heap position and an unrelated edit can reshuffle room history.
            // Uuids make that final order arbitrary, but arbitrary and STABLE.
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

/** Wire hint only. The mutation repeats the exact balance + last-active checks
 * under the room advisory lock before changing lifecycle state. */
export const canRemoveMember = (member: MemberWithRemovalState): boolean => isActiveMember(member) && member.canRemove

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

/**
 * The room's analytics pseudonym: stable, groupable, and useless to anyone
 * holding it.
 *
 * Analytics needs to answer "of the rooms that added an expense, how many
 * settled up" — which needs a per-room key. It must not be the slug, because
 * the slug IS the room's access control: anyone who reads one can open the
 * room and see every expense, amount and name. On 2026-07-28 automatic
 * PostHog page properties carried slugs for one day, which is exactly the
 * leak this exists to make impossible.
 *
 * Derived from the room UUID, never the slug. A v4 UUID carries 122 bits of
 * entropy, so the digest cannot be walked back to a room by anyone who only
 * has the digest — no shared secret required, and therefore no environment
 * variable that a redeploy can silently drop. Domain-separated exactly like
 * `deviceHash` in history.ts so the two can never collide.
 *
 * To sever historical linkage later, add a secret to the prefix: every key
 * changes, which is the rotation.
 */
const analyticsKeyFor = (roomId: string): string =>
    createHash('sha256').update(`split-room-analytics\0${roomId}`).digest('hex').slice(0, 32)

/** DB rows → wire shape. BigInt becomes a decimal string here, not later. */
export function toRoomState(room: RoomWithRelations): RoomState {
    const balances = balancesOf(room)
    return {
        room: {
            id: room.id,
            slug: room.slug,
            analyticsKey: analyticsKeyFor(room.id),
            name: room.name,
            emoji: room.emoji,
            currency: room.currency,
            coverUrl: room.coverUrl,
            theme: room.theme,
            hasReachedSharedBalance: room.firstSharedBalanceExpenseId !== null,
            createdAt: room.createdAt.toISOString(),
        },
        members: room.members.map((m) => ({
            id: m.id,
            name: safePersonNameForDisplay(m.name),
            avatar: m.avatar,
            avatarPalette: m.avatarPalette,
            createdAt: m.createdAt.toISOString(),
            removedAt: m.removedAt?.toISOString() ?? null,
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

type RoomReader = Pick<Prisma.TransactionClient, 'room'>

/** Exact-zero eligibility is derived from the same current ledger fold the UI
 * settles. The mutation repeats it under the room lock; this is only its wire
 * hint for rendering controls. */
function withRemovalState(room: BaseRoomWithRelations): RoomWithRelations {
    const balances = balancesOf(room)
    const activeCount = activeMembers(room.members).length
    return {
        ...room,
        members: room.members.map((member) => ({
            ...member,
            canRemove: isActiveMember(member) && activeCount > 1 && (balances.get(member.id) ?? 0n) === 0n,
        })),
    }
}

export async function loadRoom(slug: string, db: RoomReader = prisma): Promise<RoomWithRelations> {
    const room = await db.room.findUnique({ where: { slug }, ...roomArgs })
    if (!room) throw notFound('room not found')
    return withRemovalState(room)
}

export async function loadRoomById(id: string): Promise<RoomWithRelations> {
    const room = await prisma.room.findUnique({ where: { id }, ...roomArgs })
    if (!room) throw notFound('room not found')
    return withRemovalState(room)
}

export const roomStateBySlug = async (slug: string): Promise<RoomState> => toRoomState(await loadRoom(slug))

/** The member a request is acting as, per `X-Member-Token`. Attribution only. */
export function memberIdForToken(room: RoomWithRelations, token: string | null): string | null {
    if (!token) return null
    return room.members.find((m) => m.token === token && isActiveMember(m))?.id ?? null
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
    const member = activeMember(room.members, memberId)
    if (!member || member.token !== memberToken) {
        throw new ApiError(403, 'MEMBER_TOKEN_INVALID', 'this device is not signed in as a member of this room')
    }
}
