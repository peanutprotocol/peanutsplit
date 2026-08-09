import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { RoomHistoryPage } from '@/lib/api-types'
import { prisma } from '@/server/db'
import { ApiError, badRequest, notFound } from '@/server/http'

export const ROOM_ACTIONS = [
    'history_started',
    'room_created',
    'room_imported',
    'room_import_appended',
    'room_settings_updated',
    'member_joined',
    'member_added',
    'member_removed',
    'member_restored',
    'member_avatar_updated',
    'expense_added',
    'expense_edited',
    'expense_deleted',
    'expense_restored',
    'reaction_added',
    'reaction_removed',
    'settlement_recorded',
    'settlement_deleted',
    'push_subscribed',
    'push_unsubscribed',
] as const

export type RoomAction = (typeof ROOM_ACTIONS)[number]

interface RoomWriteEventData {
    subjectType?: 'room' | 'member' | 'expense' | 'reaction' | 'settlement' | 'push_subscription'
    subjectId?: string | null
    before?: unknown
    after?: unknown
    detail?: unknown
}

export type RoomWriteEvent =
    | (RoomWriteEventData & { kind: 'expense_added'; expenseId: string })
    | (RoomWriteEventData & { kind: 'settlement_recorded'; settlementId: string })
    | (RoomWriteEventData & { kind: Exclude<RoomAction, 'expense_added' | 'settlement_recorded'> })

export type PushRoomWriteEvent = Extract<RoomWriteEvent, { kind: 'expense_added' | 'settlement_recorded' }>

export interface AuditActor {
    memberId: string | null
    memberName: string | null
}

type AuditDb = Pick<Prisma.TransactionClient, 'roomAuditEvent' | '$queryRaw'>

interface ExpenseAuditInput {
    id: string
    roomId: string
    description: string
    amountMinor: bigint | string
    currency: string
    baseAmountMinor: bigint | string
    fxRate: Prisma.Decimal | string
    paidById: string
    createdById: string | null
    splitMode: string
    date: Date | string
    category: string | null
    createdAt: Date | string
    deletedAt: Date | string | null
    shares?: readonly {
        memberId: string
        amountMinor: bigint | string
        enteredAmountMinor: bigint | string | null
        splitWeight: bigint | string | null
    }[]
    reactions?: readonly { memberId: string; emoji: string }[]
}

const textOf = (value: bigint | Prisma.Decimal | string): string => value.toString()
const decimalOf = (value: Prisma.Decimal | string): string => new Prisma.Decimal(value).toString()
const dateOf = (value: Date | string): string => (value instanceof Date ? value.toISOString() : value)

/** One stable, secret-free shape for expense create/edit/delete/restore diffs. */
export function expenseAuditSnapshot(expense: ExpenseAuditInput) {
    return {
        id: expense.id,
        roomId: expense.roomId,
        description: expense.description,
        amountMinor: textOf(expense.amountMinor),
        currency: expense.currency,
        baseAmountMinor: textOf(expense.baseAmountMinor),
        fxRate: decimalOf(expense.fxRate),
        paidById: expense.paidById,
        createdById: expense.createdById,
        splitMode: expense.splitMode,
        date: dateOf(expense.date),
        category: expense.category,
        createdAt: dateOf(expense.createdAt),
        deletedAt: expense.deletedAt ? dateOf(expense.deletedAt) : null,
        shares: [...(expense.shares ?? [])]
            .map((share) => ({
                memberId: share.memberId,
                amountMinor: textOf(share.amountMinor),
                enteredAmountMinor: share.enteredAmountMinor === null ? null : textOf(share.enteredAmountMinor),
                splitWeight: share.splitWeight === null ? null : textOf(share.splitWeight),
            }))
            .sort((left, right) => left.memberId.localeCompare(right.memberId)),
        reactions: [...(expense.reactions ?? [])]
            .map((reaction) => ({ memberId: reaction.memberId, emoji: reaction.emoji }))
            .sort((left, right) =>
                left.memberId === right.memberId
                    ? left.emoji.localeCompare(right.emoji)
                    : left.memberId.localeCompare(right.memberId)
            ),
    }
}

/** The fields an edit is allowed to change, excluding generated row identity. */
export function expenseAuditValues(expense: ExpenseAuditInput) {
    const snapshot = expenseAuditSnapshot(expense)
    return {
        description: snapshot.description,
        amountMinor: snapshot.amountMinor,
        currency: snapshot.currency,
        baseAmountMinor: snapshot.baseAmountMinor,
        fxRate: snapshot.fxRate,
        paidById: snapshot.paidById,
        splitMode: snapshot.splitMode,
        date: snapshot.date,
        category: snapshot.category,
        shares: snapshot.shares,
    }
}

interface RestorableEqualShare {
    memberId: string
    amountMinor: bigint
    enteredAmountMinor: null
    splitWeight: null
}

const jsonRecord = (value: Prisma.JsonValue | null): Prisma.JsonObject | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null

/** Keep this projection byte-for-byte aligned with `expenseAuditValues`. Audit
 * snapshots contain identity and reaction fields too, but neither should make a
 * safe share-only Undo fail after (for example) somebody reacted to the row. */
const expenseValuesFromAudit = (snapshot: Prisma.JsonValue | null) => {
    const record = jsonRecord(snapshot)
    if (!record || !Array.isArray(record.shares)) return null
    const shares: Prisma.JsonObject[] = []
    for (const item of record.shares) {
        const share = jsonRecord(item)
        if (!share) return null
        // PostgreSQL jsonb does not preserve object-key order. Re-project every
        // share so structural comparison cannot depend on its storage order.
        shares.push({
            memberId: share.memberId ?? null,
            amountMinor: share.amountMinor ?? null,
            enteredAmountMinor: share.enteredAmountMinor ?? null,
            splitWeight: share.splitWeight ?? null,
        })
    }
    return {
        description: record.description,
        amountMinor: record.amountMinor,
        currency: record.currency,
        baseAmountMinor: record.baseAmountMinor,
        fxRate: record.fxRate,
        paidById: record.paidById,
        splitMode: record.splitMode,
        date: record.date,
        category: record.category,
        shares,
    }
}

const restorableEqualShares = (value: Prisma.JsonValue): RestorableEqualShare[] | null => {
    if (!Array.isArray(value) || value.length === 0) return null
    const shares: RestorableEqualShare[] = []
    const memberIds = new Set<string>()
    for (const item of value) {
        const share = jsonRecord(item)
        if (
            !share ||
            typeof share.memberId !== 'string' ||
            typeof share.amountMinor !== 'string' ||
            !/^\d+$/.test(share.amountMinor) ||
            share.enteredAmountMinor !== null ||
            share.splitWeight !== null ||
            memberIds.has(share.memberId)
        ) {
            return null
        }
        memberIds.add(share.memberId)
        shares.push({
            memberId: share.memberId,
            amountMinor: BigInt(share.amountMinor),
            enteredAmountMinor: null,
            splitWeight: null,
        })
    }
    return shares
}

const sameMemberSet = (left: readonly { memberId: string }[], right: readonly { memberId: string }[]): boolean => {
    const rightIds = new Set(right.map((share) => share.memberId))
    return rightIds.size === left.length && left.every((share) => rightIds.has(share.memberId))
}

/**
 * Recover the exact pre-Add equal shares for conflict-safe Undo.
 *
 * Equal arithmetic alone cannot reconstruct an imported row's rounding owner:
 * adding a fourth member to 1000/3 produces four identical 250 shares and loses
 * which original member held 334. The immutable Add audit event is the one
 * transactional record that still has that fact. We accept it only when its
 * complete editable/money `after` state equals the locked expense, its scalar
 * facts were unchanged by Add, and its participant delta is exactly `memberId`.
 */
export async function catchUpUndoSharesFromAudit(
    tx: Pick<Prisma.TransactionClient, 'roomAuditEvent'>,
    expense: ExpenseAuditInput,
    memberId: string
): Promise<RestorableEqualShare[] | null> {
    const currentValues = expenseAuditValues(expense)
    const events = await tx.roomAuditEvent.findMany({
        where: {
            roomId: expense.roomId,
            action: 'expense_edited',
            subjectType: 'expense',
            subjectId: expense.id,
            detail: {
                equals: {
                    operation: 'catch_up_equal_participant',
                    action: 'add',
                    memberId,
                },
            },
        },
        select: { before: true, after: true, detail: true },
        orderBy: { id: 'desc' },
    })

    for (const event of events) {
        const detail = jsonRecord(event.detail)
        if (
            detail?.operation !== 'catch_up_equal_participant' ||
            detail.action !== 'add' ||
            detail.memberId !== memberId
        ) {
            continue
        }

        const before = expenseValuesFromAudit(event.before)
        const after = expenseValuesFromAudit(event.after)
        if (!before || !after || JSON.stringify(after) !== JSON.stringify(currentValues)) continue

        const { shares: beforeJson, ...beforeFacts } = before
        const { shares: afterJson, ...afterFacts } = after
        if (JSON.stringify(beforeFacts) !== JSON.stringify(afterFacts)) continue

        const beforeShares = restorableEqualShares(beforeJson)
        const afterShares = restorableEqualShares(afterJson)
        if (!beforeShares || !afterShares || beforeFacts.splitMode !== 'EQUAL') continue
        if (beforeShares.some((share) => share.memberId === memberId)) continue
        if (!afterShares.some((share) => share.memberId === memberId)) continue
        if (!sameMemberSet(afterShares, [...beforeShares, { memberId }])) continue
        if (beforeShares.reduce((sum, share) => sum + share.amountMinor, 0n).toString() !== beforeFacts.baseAmountMinor)
            continue

        return beforeShares
    }

    return null
}

export const lockRoomWrite = async (tx: Pick<Prisma.TransactionClient, '$queryRaw'>, roomId: string): Promise<void> => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${roomId}, 0))`
}

function cookieValue(request: Request, name: string): string | null {
    const part = request.headers
        .get('cookie')
        ?.split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith(`${name}=`))
    if (!part) return null
    try {
        return decodeURIComponent(part.slice(name.length + 1)) || null
    } catch {
        return null
    }
}

const deviceHash = (request: Request, roomId: string): string | null => {
    const raw = cookieValue(request, 'device-id')
    return raw ? createHash('sha256').update(`split-room-device\0${roomId}\0${raw}`).digest('hex') : null
}

/** Resolve optional attribution. A missing token remains anonymous link-holder
 * access, but a supplied token is a concrete identity claim: accepting an old
 * or Former member's proof as anonymous would silently misattribute writes. */
export function actorFromToken(
    members: readonly { id: string; name: string; token: string; removedAt?: Date | string | null }[],
    token: string | null
): AuditActor {
    if (!token) return { memberId: null, memberName: null }
    const member = members.find((candidate) => candidate.token === token && candidate.removedAt == null)
    if (!member) {
        throw new ApiError(403, 'MEMBER_TOKEN_INVALID', 'this device is not signed in as an active member of this room')
    }
    return { memberId: member.id, memberName: member.name }
}

export const actorForMember = (member: { id: string; name: string }): AuditActor => ({
    memberId: member.id,
    memberName: member.name,
})

/** Prisma JSON accepts plain JSON only. This also gives BigInt, Decimal and Date stable text forms. */
const jsonValue = (value: unknown): Prisma.InputJsonValue =>
    JSON.parse(
        JSON.stringify(value, (_key, item) => {
            if (typeof item === 'bigint') return item.toString()
            if (item instanceof Date) return item.toISOString()
            if (Prisma.Decimal.isDecimal(item)) return item.toString()
            return item
        })
    ) as Prisma.InputJsonValue

export async function appendRoomAuditEvent(input: {
    tx: AuditDb
    request: Request
    roomId: string
    actor: AuditActor
    event: RoomWriteEvent
}): Promise<void> {
    // Re-entrant for callers that already hold it. Keeping the lock here makes
    // device-letter allocation safe for every future audit caller by default.
    await lockRoomWrite(input.tx, input.roomId)
    const hash = deviceHash(input.request, input.roomId)
    let ordinal: number | null = null
    if (hash) {
        const first = await input.tx.roomAuditEvent.findFirst({
            where: { roomId: input.roomId, actorDeviceHash: hash },
            select: { deviceOrdinal: true },
            orderBy: { id: 'asc' },
        })
        if (first?.deviceOrdinal) ordinal = first.deviceOrdinal
        else {
            const latest = await input.tx.roomAuditEvent.findFirst({
                where: { roomId: input.roomId, deviceOrdinal: { not: null } },
                select: { deviceOrdinal: true },
                orderBy: { deviceOrdinal: 'desc' },
            })
            ordinal = (latest?.deviceOrdinal ?? 0) + 1
        }
    }

    const { event } = input
    await input.tx.roomAuditEvent.create({
        data: {
            roomId: input.roomId,
            action: event.kind,
            subjectType: event.subjectType ?? null,
            subjectId: event.subjectId ?? null,
            actorDeviceHash: hash,
            deviceOrdinal: ordinal,
            actorMemberId: input.actor.memberId,
            actorMemberName: input.actor.memberName,
            ...(event.before === undefined ? {} : { before: jsonValue(event.before) }),
            ...(event.after === undefined ? {} : { after: jsonValue(event.after) }),
            ...(event.detail === undefined ? {} : { detail: jsonValue(event.detail) }),
        },
    })
}

export const labelForOrdinal = (ordinal: number | null): string | null => {
    if (!ordinal || ordinal < 1) return null
    let value = ordinal
    let label = ''
    while (value > 0) {
        value -= 1
        label = String.fromCharCode(65 + (value % 26)) + label
        value = Math.floor(value / 26)
    }
    return label
}

const PAGE_SIZE = 50

export async function roomHistoryBySlug(slug: string, cursor?: string | null): Promise<RoomHistoryPage> {
    const room = await prisma.room.findUnique({ where: { slug }, select: { id: true } })
    if (!room) throw notFound('room not found')

    const cursorId = cursor && /^\d+$/.test(cursor) ? BigInt(cursor) : null
    if (cursor && cursorId === null) throw badRequest('history cursor is invalid', 'HISTORY_CURSOR_INVALID')
    const cursorRow = cursorId
        ? await prisma.roomAuditEvent.findFirst({ where: { id: cursorId, roomId: room.id }, select: { id: true } })
        : null
    if (cursor && !cursorRow) throw badRequest('history cursor is invalid', 'HISTORY_CURSOR_INVALID')

    const rows = await prisma.roomAuditEvent.findMany({
        where: {
            roomId: room.id,
            ...(cursorRow ? { id: { lt: cursorRow.id } } : {}),
        },
        orderBy: { id: 'desc' },
        take: PAGE_SIZE + 1,
    })
    const more = rows.length > PAGE_SIZE
    const page = rows.slice(0, PAGE_SIZE)
    return {
        events: page.map((row) => ({
            id: row.id.toString(),
            action: row.action as RoomAction,
            subjectType: row.subjectType,
            subjectId: row.subjectId,
            deviceLabel: labelForOrdinal(row.deviceOrdinal),
            actorMemberId: row.actorMemberId,
            actorMemberName: row.actorMemberName,
            before: row.before,
            after: row.after,
            detail: row.detail,
            createdAt: row.createdAt.toISOString(),
        })),
        nextCursor: more ? (page.at(-1)?.id.toString() ?? null) : null,
    }
}
