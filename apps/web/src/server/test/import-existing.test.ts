/**
 * Existing-room imports are an append-only, room-scoped bulk write. These tests
 * exercise the route against PostgreSQL so retries, locks, provenance and
 * rollback are proved at the boundary where they matter.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as postGlobalImport } from '@/app/api/import/route'
import { POST as postRoom } from '@/app/api/rooms/route'
import { POST as postMember } from '@/app/api/rooms/[slug]/members/route'
import { POST as postExpense } from '@/app/api/rooms/[slug]/expenses/route'
import { POST as postImportIntoRoom } from '@/app/api/rooms/[slug]/import/route'
import { SIMPLE_GROUP } from '@/lib/__fixtures__/splitwise'
import { parseSplitwiseCsv, type SplitwiseImport } from '@/lib/splitwise-csv'
import type {
    ApiError,
    ImportIntoRoomInput,
    ImportIntoRoomResult,
    ImportMemberMapping,
    RoomState,
    RoomStateWithAddedMember,
    RoomStateWithMember,
} from '@/lib/api-types'
import { resetEvents, subscribe } from '@/server/events'
import { FX_CORE } from '@/server/fx'
import { STATIC_USD_PER_UNIT } from '@/server/money'
import { resetRateLimits } from '@/server/rateLimit'
import { prisma, truncateAll } from '@/server/test/db'

const BASE = 'http://localhost'
type Params = Record<string, string>
type Handler = (request: Request, ctx: { params: Promise<Params> }) => Promise<Response>

const call = async <T>(
    handler: Handler,
    opts: { path: string; method?: string; body?: unknown; params?: Params; token?: string }
): Promise<{ status: number; body: T }> => {
    const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body)
    const request = new Request(`${BASE}${opts.path}`, {
        method: opts.method ?? 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(payload === undefined ? {} : { 'Content-Length': String(Buffer.byteLength(payload)) }),
            ...(opts.token ? { 'X-Member-Token': opts.token } : {}),
        },
        body: payload,
    })
    const response = await handler(request, { params: Promise.resolve(opts.params ?? {}) })
    return { status: response.status, body: (await response.json()) as T }
}

const newRoom = (overrides: Partial<{ name: string; emoji: string; currency: string; creatorName: string }> = {}) =>
    call<RoomStateWithMember>(postRoom as unknown as Handler, {
        path: '/api/rooms',
        method: 'POST',
        body: { name: 'Target room', emoji: '🥜', currency: 'EUR', creatorName: 'Ana', ...overrides },
    })

const importNewRoom = (body: unknown) =>
    call<RoomStateWithMember>(postGlobalImport as unknown as Handler, {
        path: '/api/import',
        method: 'POST',
        body,
    })

const addMember = (slug: string, name: string, token?: string) =>
    call<RoomStateWithAddedMember>(postMember as unknown as Handler, {
        path: `/api/rooms/${slug}/members`,
        method: 'POST',
        params: { slug },
        token,
        body: { name, intent: 'add' },
    })

const addExpense = (slug: string, body: unknown, token?: string) =>
    call<RoomState>(postExpense as unknown as Handler, {
        path: `/api/rooms/${slug}/expenses`,
        method: 'POST',
        params: { slug },
        token,
        body,
    })

const append = <T = ImportIntoRoomResult>(slug: string, body: unknown, token?: string) =>
    call<T>(postImportIntoRoom as Handler, {
        path: `/api/rooms/${slug}/import`,
        method: 'POST',
        params: { slug },
        token,
        body,
    })

const source = (): SplitwiseImport => parseSplitwiseCsv(SIMPLE_GROUP)

const bodyFor = (parsed: SplitwiseImport, members: ImportMemberMapping[]): ImportIntoRoomInput => ({
    members,
    expenses: parsed.expenses,
})

const importEvents = (roomId: string) =>
    prisma.roomAuditEvent.findMany({
        where: { roomId, action: 'room_import_appended' },
        orderBy: { id: 'asc' },
    })

beforeEach(async () => {
    process.env.SPLIT_FX_MODE = 'static'
    await truncateAll()
    resetRateLimits()
    resetEvents()
})

afterEach(() => {
    process.env.SPLIT_FX_MODE = 'static'
})

describe('POST /api/rooms/:slug/import', () => {
    it('recognises a legacy fresh-room import after Split Pro You was renamed and backfills source identity', async () => {
        const sourceFingerprint = '1'.repeat(64)
        const original: SplitwiseImport = {
            members: ['You', 'Natalia'],
            expenses: [
                {
                    date: '2026-08-05',
                    description: 'Dinner',
                    category: 'Dining out',
                    currencyCode: 'EUR',
                    costMinor: '1000',
                    paidBy: 'Natalia',
                    splitMode: 'EQUAL',
                    shares: [
                        { member: 'You', amountMinor: '500' },
                        { member: 'Natalia', amountMinor: '500' },
                    ],
                },
            ],
            suggestedCurrency: 'EUR',
            currencies: ['EUR'],
            totalBalance: null,
            warnings: [],
        }
        const renamedExpenses = original.expenses.map((expense) => ({
            ...expense,
            paidBy: expense.paidBy === 'You' ? 'Konrad' : expense.paidBy,
            shares: expense.shares.map((share) => ({
                ...share,
                member: share.member === 'You' ? 'Konrad' : share.member,
            })),
        }))

        // Simulate a batch written before immutable source fingerprints existed:
        // the old UI renamed `You` throughout the parsed projection first.
        const created = await importNewRoom({
            roomName: 'Renamed Split Pro import',
            currency: 'EUR',
            creatorName: 'Konrad',
            members: ['Konrad', 'Natalia'],
            expenses: renamedExpenses,
        })
        expect(created.status).toBe(201)
        const legacyBatch = await prisma.importBatch.findFirstOrThrow({ where: { roomId: created.body.room.id } })
        expect(legacyBatch.sourceFingerprint).toBeNull()

        const ids = new Map(created.body.members.map((member) => [member.name, member.id]))
        const replay = await append(
            created.body.room.slug,
            {
                sourceFingerprint,
                members: [
                    { sourceName: 'You', memberId: ids.get('Konrad')! },
                    { sourceName: 'Natalia', memberId: ids.get('Natalia')! },
                ],
                expenses: original.expenses,
            },
            created.body.memberToken
        )

        expect(replay.status).toBe(200)
        expect(replay.body).toMatchObject({
            batchId: legacyBatch.id,
            addedExpenses: 1,
            addedMembers: 2,
            alreadyImported: true,
        })
        expect(replay.body.expenses).toHaveLength(1)
        expect(await prisma.importBatch.count({ where: { roomId: created.body.room.id } })).toBe(1)
        expect(await prisma.importBatch.findUniqueOrThrow({ where: { id: legacyBatch.id } })).toMatchObject({
            sourceFingerprint,
        })
    })

    it('recognises the source that originally created a room as a replay', async () => {
        const parsed = source()
        const sourceFingerprint = '3'.repeat(64)
        const created = await importNewRoom({
            sourceFingerprint,
            roomName: 'Originally imported',
            emoji: '🧦',
            currency: 'EUR',
            creatorName: 'Ana',
            members: parsed.members,
            expenses: parsed.expenses,
        })
        expect(created.status).toBe(201)

        const batch = await prisma.importBatch.findFirstOrThrow({ where: { roomId: created.body.room.id } })
        expect(batch).toMatchObject({ expenseCount: 3, addedMemberCount: 3, sourceFingerprint })
        const importedBefore = await prisma.expense.findMany({
            where: { roomId: created.body.room.id },
            orderBy: { importRowIndex: 'asc' },
        })
        expect(importedBefore.map((expense) => expense.importBatchId)).toEqual([batch.id, batch.id, batch.id])
        expect(importedBefore.map((expense) => expense.importRowIndex)).toEqual([0, 1, 2])
        expect(importedBefore.map((expense) => expense.createdAt.getTime() - batch.importedAt.getTime())).toEqual([
            0, 1, 2,
        ])

        const ids = new Map(created.body.members.map((member) => [member.name, member.id]))
        const body: ImportIntoRoomInput = {
            ...bodyFor(parsed, [
                { sourceName: 'Ana', memberId: ids.get('Ana')! },
                { sourceName: 'Bruno', memberId: ids.get('Bruno')! },
                { sourceName: 'Carla', memberId: ids.get('Carla')! },
            ]),
            sourceFingerprint,
        }
        const memberIdsBefore = created.body.members.map((member) => member.id).sort()
        const expenseIdsBefore = created.body.expenses.map((expense) => expense.id).sort()
        let pokes = 0
        const unsubscribe = subscribe(created.body.room.id, () => {
            pokes += 1
        })

        const replay = await append(created.body.room.slug, body, created.body.memberToken)
        unsubscribe?.()

        expect(replay.status).toBe(200)
        expect(replay.body).toMatchObject({
            batchId: batch.id,
            importedAt: batch.importedAt.toISOString(),
            addedExpenses: 3,
            addedMembers: 3,
            alreadyImported: true,
        })
        expect(replay.body.members.map((member) => member.id).sort()).toEqual(memberIdsBefore)
        expect(replay.body.expenses.map((expense) => expense.id).sort()).toEqual(expenseIdsBefore)
        expect(await prisma.member.count({ where: { roomId: created.body.room.id } })).toBe(3)
        expect(await prisma.expense.count({ where: { roomId: created.body.room.id } })).toBe(3)
        expect(await prisma.importBatch.count({ where: { roomId: created.body.room.id } })).toBe(1)
        expect(await importEvents(created.body.room.id)).toHaveLength(0)
        expect(
            (
                await prisma.roomAuditEvent.findMany({
                    where: { roomId: created.body.room.id },
                    select: { action: true },
                })
            ).map((event) => event.action)
        ).toEqual(['room_imported'])
        expect(pokes).toBe(0)
    })

    it('appends a source into a fresh target without creating or renaming the room', async () => {
        const { body: target } = await newRoom()
        const parsed = source()
        const ana = target.members[0]
        const roomBefore = await prisma.room.findUniqueOrThrow({ where: { id: target.room.id } })
        let pokes = 0
        const unsubscribe = subscribe(target.room.id, () => {
            pokes += 1
        })

        const result = await append(
            target.room.slug,
            bodyFor(parsed, [
                { sourceName: 'Ana', memberId: ana.id },
                { sourceName: 'Bruno', newMemberName: 'Bruno' },
                { sourceName: 'Carla', newMemberName: 'Carla' },
            ]),
            target.memberToken
        )
        unsubscribe?.()

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({
            batchId: expect.any(String),
            importedAt: expect.any(String),
            addedExpenses: 3,
            addedMembers: 2,
            alreadyImported: false,
        })
        expect(result.body.room).toMatchObject({
            id: target.room.id,
            slug: target.room.slug,
            name: target.room.name,
            emoji: target.room.emoji,
            currency: target.room.currency,
            hasReachedSharedBalance: true,
        })
        expect(await prisma.room.count()).toBe(1)
        expect(result.body.members.map((member) => member.name)).toEqual(['Ana', 'Bruno', 'Carla'])
        expect(result.body.expenses).toHaveLength(3)

        const balances = new Map(result.body.members.map((member) => [member.name, result.body.balances[member.id]]))
        for (const expected of parsed.totalBalance ?? []) {
            expect(balances.get(expected.member)).toBe(expected.netMinor.toString())
        }

        const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: result.body.batchId } })
        expect(batch).toMatchObject({
            roomId: target.room.id,
            expenseCount: 3,
            addedMemberCount: 2,
            importedAt: new Date(result.body.importedAt),
        })
        expect(batch.fingerprint).toMatch(/^[a-f0-9]{64}$/)

        const rows = await prisma.expense.findMany({
            where: { importBatchId: batch.id },
            orderBy: { importRowIndex: 'asc' },
        })
        expect(rows.map((row) => row.importRowIndex)).toEqual([0, 1, 2])
        expect(rows.every((row) => row.importBatchId === batch.id && row.createdById === ana.id)).toBe(true)
        expect(rows.map((row) => row.createdAt.getTime() - rows[0].createdAt.getTime())).toEqual([0, 1, 2])
        expect(rows.map((row) => row.date.toISOString())).toEqual(
            parsed.expenses.map((expense) => `${expense.date}T00:00:00.000Z`)
        )

        const roomAfter = await prisma.room.findUniqueOrThrow({ where: { id: target.room.id } })
        expect(roomAfter).toMatchObject({
            id: roomBefore.id,
            slug: roomBefore.slug,
            name: roomBefore.name,
            emoji: roomBefore.emoji,
            currency: roomBefore.currency,
            createdAt: roomBefore.createdAt,
        })
        expect(rows.map((row) => row.id)).toContain(roomAfter.firstSharedBalanceExpenseId)

        const events = await importEvents(target.room.id)
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
            subjectType: 'room',
            subjectId: target.room.id,
            actorMemberId: ana.id,
            actorMemberName: 'Ana',
            detail: expect.objectContaining({
                batchId: batch.id,
                expenseCount: 3,
                memberCount: 2,
            }),
        })
        expect(
            JSON.stringify(events[0], (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
        ).not.toContain(target.memberToken)
        expect(pokes).toBe(1)
    })

    it('preserves populated history, uses target currency, and orders rows after future existing timestamps', async () => {
        const { body: target } = await newRoom({ currency: 'USD' })
        const ana = target.members[0]
        const { body: withBea } = await addMember(target.room.slug, 'Bea', target.memberToken)
        const bea = withBea.members.find((member) => member.name === 'Bea')!
        const populatedResult = await addExpense(
            target.room.slug,
            {
                description: 'Before import',
                amountMinor: '1000',
                currency: 'USD',
                paidById: ana.id,
                splitMode: 'EQUAL',
                participantIds: [ana.id, bea.id],
                date: '2026-07-31T00:00:00.000Z',
            },
            target.memberToken
        )
        expect(populatedResult).toMatchObject({ status: 201, body: { expenses: expect.any(Array) } })
        const populated = populatedResult.body
        const oldExpenseId = populated.expenses.find((expense) => expense.description === 'Before import')!.id
        const future = new Date('2035-01-02T03:04:05.123Z')
        await prisma.expense.update({ where: { id: oldExpenseId }, data: { createdAt: future } })
        const oldBefore = await prisma.expense.findUniqueOrThrow({
            where: { id: oldExpenseId },
            include: { shares: { orderBy: { memberId: 'asc' } } },
        })
        const roomBefore = await prisma.room.findUniqueOrThrow({ where: { id: target.room.id } })

        const result = await append(
            target.room.slug,
            bodyFor(source(), [
                { sourceName: 'Ana', memberId: ana.id },
                { sourceName: 'Bruno', memberId: bea.id },
                { sourceName: 'Carla', newMemberName: 'Cora' },
            ]),
            target.memberToken
        )

        expect(result.status).toBe(200)
        expect(result.body.room).toMatchObject({ id: target.room.id, slug: target.room.slug, currency: 'USD' })
        expect(result.body.expenses).toHaveLength(4)
        const byName = new Map(result.body.members.map((member) => [member.name, result.body.balances[member.id]]))
        expect(byName).toEqual(
            new Map([
                ['Ana', '2120'],
                ['Bea', '-2120'],
                ['Cora', '0'],
            ])
        )

        const dinner = result.body.expenses.find((expense) => expense.description === 'Dinner')!
        expect(dinner).toMatchObject({ currency: 'EUR', amountMinor: '6000', baseAmountMinor: '6480' })
        expect(dinner.shares.reduce((sum, share) => sum + BigInt(share.amountMinor), 0n)).toBe(6480n)

        const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: result.body.batchId } })
        const imported = await prisma.expense.findMany({
            where: { importBatchId: batch.id },
            orderBy: { importRowIndex: 'asc' },
        })
        expect(batch.importedAt.getTime()).toBeLessThan(future.getTime())
        expect(imported.map((row) => row.createdAt.getTime())).toEqual([
            future.getTime() + 1,
            future.getTime() + 2,
            future.getTime() + 3,
        ])

        const oldAfter = await prisma.expense.findUniqueOrThrow({
            where: { id: oldExpenseId },
            include: { shares: { orderBy: { memberId: 'asc' } } },
        })
        expect(oldAfter).toEqual(oldBefore)
        const roomAfter = await prisma.room.findUniqueOrThrow({ where: { id: target.room.id } })
        expect(roomAfter.firstSharedBalanceExpenseId).toBe(roomBefore.firstSharedBalanceExpenseId)
        expect(roomAfter).toMatchObject({
            slug: roomBefore.slug,
            name: roomBefore.name,
            emoji: roomBefore.emoji,
            currency: roomBefore.currency,
            createdAt: roomBefore.createdAt,
        })
    })

    it('accepts a bounded source import even when the target roster already exceeds the source cap', async () => {
        const { body: target } = await newRoom()
        await prisma.member.createMany({
            data: Array.from({ length: 20 }, (_, index) => ({
                roomId: target.room.id,
                name: `Existing ${index + 2}`,
                token: `qa-existing-${index + 2}-${target.room.id}`,
            })),
        })
        expect(await prisma.member.count({ where: { roomId: target.room.id } })).toBe(21)
        const existing = await prisma.member.findFirstOrThrow({
            where: { roomId: target.room.id, name: 'Existing 2' },
        })

        const result = await append(
            target.room.slug,
            bodyFor(source(), [
                { sourceName: 'Ana', memberId: target.members[0].id },
                { sourceName: 'Bruno', memberId: existing.id },
                { sourceName: 'Carla', newMemberName: 'Imported Carla' },
            ]),
            target.memberToken
        )

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({ addedExpenses: 3, addedMembers: 1, alreadyImported: false })
        expect(result.body.members).toHaveLength(22)
        expect(result.body.members.map((member) => member.name)).toContain('Imported Carla')
        expect(await prisma.importBatch.count({ where: { roomId: target.room.id } })).toBe(1)
    })

    it('no-ops an exact semantic replay, but appends a changed overlapping export in full', async () => {
        const { body: target } = await newRoom()
        const parsed = source()
        let pokes = 0
        const unsubscribe = subscribe(target.room.id, () => {
            pokes += 1
        })
        const originalBody = bodyFor(parsed, [
            { sourceName: 'Ana', memberId: target.members[0].id },
            { sourceName: 'Bruno', newMemberName: 'Bruno' },
            { sourceName: 'Carla', newMemberName: 'Carla' },
        ])
        const first = await append(target.room.slug, originalBody, target.memberToken)
        // This repeats the post-first-import `newMemberName` mappings verbatim.
        // Replay detection must happen before those now-existing names are
        // checked, otherwise a safe retry turns into DUPLICATE_MEMBER_NAME.
        const exactReplay = await append(target.room.slug, originalBody, target.memberToken)
        const ana = first.body.members.find((member) => member.name === 'Ana')!
        const bruno = first.body.members.find((member) => member.name === 'Bruno')!
        const carla = first.body.members.find((member) => member.name === 'Carla')!
        const reordered = [...parsed.expenses].reverse().map((expense) => ({
            ...expense,
            costMinor: expense.costMinor.padStart(expense.costMinor.length + 1, '0'),
            paidBy: expense.paidBy.toUpperCase(),
            shares: [...expense.shares].reverse().map((share) => ({ ...share, member: share.member.toLowerCase() })),
        }))
        const replay = await append(
            target.room.slug,
            {
                members: [
                    { sourceName: 'carla', memberId: ana.id },
                    { sourceName: 'ANA', memberId: bruno.id },
                    { sourceName: 'bruno', memberId: carla.id },
                ],
                expenses: reordered,
            },
            target.memberToken
        )

        expect(first.status).toBe(200)
        expect(exactReplay.status).toBe(200)
        expect(exactReplay.body).toMatchObject({
            batchId: first.body.batchId,
            importedAt: first.body.importedAt,
            addedExpenses: first.body.addedExpenses,
            addedMembers: first.body.addedMembers,
            alreadyImported: true,
        })
        expect(replay.status).toBe(200)
        expect(replay.body).toMatchObject({
            batchId: first.body.batchId,
            importedAt: first.body.importedAt,
            addedExpenses: first.body.addedExpenses,
            addedMembers: first.body.addedMembers,
            alreadyImported: true,
        })
        expect(replay.body.expenses).toHaveLength(3)
        expect(await prisma.importBatch.count({ where: { roomId: target.room.id } })).toBe(1)
        expect(await importEvents(target.room.id)).toHaveLength(1)
        expect(pokes).toBe(1)

        const changedExpenses = parsed.expenses.map((expense, index) =>
            index === 1 ? { ...expense, description: `${expense.description} corrected` } : expense
        )
        const changed = await append(
            target.room.slug,
            {
                members: [
                    { sourceName: 'Ana', memberId: ana.id },
                    { sourceName: 'Bruno', memberId: bruno.id },
                    { sourceName: 'Carla', memberId: carla.id },
                ],
                expenses: changedExpenses,
            },
            target.memberToken
        )
        unsubscribe?.()

        expect(changed.status).toBe(200)
        expect(changed.body).toMatchObject({ addedExpenses: 3, addedMembers: 0, alreadyImported: false })
        expect(changed.body.batchId).not.toBe(first.body.batchId)
        expect(changed.body.expenses).toHaveLength(6)
        expect(changed.body.expenses.filter((expense) => expense.description === 'Dinner')).toHaveLength(2)
        expect(changed.body.expenses.filter((expense) => expense.description === 'Taxi corrected')).toHaveLength(1)
        expect(await prisma.importBatch.count({ where: { roomId: target.room.id } })).toBe(2)
        expect(await importEvents(target.room.id)).toHaveLength(2)
        expect(pokes).toBe(2)
    })

    it('uses immutable source identity across parser projection changes', async () => {
        const { body: target } = await newRoom()
        const parsed = source()
        const sourceFingerprint = '2'.repeat(64)
        const first = await append(
            target.room.slug,
            {
                ...bodyFor(parsed, [
                    { sourceName: 'Ana', memberId: target.members[0].id },
                    { sourceName: 'Bruno', newMemberName: 'Bruno' },
                    { sourceName: 'Carla', newMemberName: 'Carla' },
                ]),
                sourceFingerprint,
            },
            target.memberToken
        )
        expect(first.status).toBe(200)

        const ids = new Map(first.body.members.map((member) => [member.name, member.id]))
        const reparsed = parsed.expenses.map((expense) => ({
            ...expense,
            // This deliberately changes the legacy semantic hash, as a parser
            // normalization or bug fix can, while the local source is unchanged.
            description: `${expense.description} (new parser projection)`,
        }))
        const replay = await append(
            target.room.slug,
            {
                sourceFingerprint,
                members: [
                    { sourceName: 'Ana', memberId: ids.get('Ana')! },
                    { sourceName: 'Bruno', memberId: ids.get('Bruno')! },
                    { sourceName: 'Carla', memberId: ids.get('Carla')! },
                ],
                expenses: reparsed,
            },
            target.memberToken
        )

        expect(replay.status).toBe(200)
        expect(replay.body).toMatchObject({ batchId: first.body.batchId, alreadyImported: true })
        expect(replay.body.expenses).toHaveLength(parsed.expenses.length)
        expect(await prisma.importBatch.count({ where: { roomId: target.room.id } })).toBe(1)
        expect(await prisma.expense.count({ where: { roomId: target.room.id } })).toBe(parsed.expenses.length)
    })

    it('rejects invalid reconciliation without writing target members, rows, batches or audit', async () => {
        const { body: target } = await newRoom()
        const { body: other } = await newRoom({ name: 'Other room', creatorName: 'Else' })
        const parsed = source()
        const anaId = target.members[0].id
        const invalidCases: { body: unknown; status: number; code: string }[] = [
            {
                body: bodyFor(parsed, [
                    { sourceName: 'Ana', memberId: anaId },
                    { sourceName: 'Bruno', memberId: anaId },
                    { sourceName: 'Carla', newMemberName: 'Carla' },
                ]),
                status: 400,
                code: 'VALIDATION_ERROR',
            },
            {
                body: bodyFor(parsed, [
                    { sourceName: 'Ana', memberId: other.members[0].id },
                    { sourceName: 'Bruno', newMemberName: 'Bruno' },
                    { sourceName: 'Carla', newMemberName: 'Carla' },
                ]),
                status: 400,
                code: 'NOT_A_MEMBER',
            },
            {
                body: bodyFor(parsed, [
                    { sourceName: 'Ana', memberId: anaId },
                    { sourceName: 'Bruno', newMemberName: 'ana' },
                    { sourceName: 'Carla', newMemberName: 'Carla' },
                ]),
                status: 409,
                code: 'DUPLICATE_MEMBER_NAME',
            },
            {
                body: bodyFor(parsed, [
                    { sourceName: 'Ana', memberId: anaId },
                    { sourceName: 'Ana', newMemberName: 'Bruno' },
                    { sourceName: 'Carla', newMemberName: 'Carla' },
                ]),
                status: 400,
                code: 'VALIDATION_ERROR',
            },
        ]

        for (const invalid of invalidCases) {
            const result = await append<ApiError>(target.room.slug, invalid.body, target.memberToken)
            expect(result.status).toBe(invalid.status)
            expect(result.body.error.code).toBe(invalid.code)
        }

        expect(await prisma.member.count({ where: { roomId: target.room.id } })).toBe(1)
        expect(await prisma.expense.count({ where: { roomId: target.room.id } })).toBe(0)
        expect(await prisma.importBatch.count({ where: { roomId: target.room.id } })).toBe(0)
        expect(await importEvents(target.room.id)).toHaveLength(0)
    })

    it('refuses an unpriceable source currency before staging mapped members', async () => {
        const { body: target } = await newRoom()
        let pokes = 0
        const unsubscribe = subscribe(target.room.id, () => {
            pokes += 1
        })
        const body: ImportIntoRoomInput = {
            members: [
                { sourceName: 'Ana', memberId: target.members[0].id },
                { sourceName: 'Bruno', newMemberName: 'Bruno' },
            ],
            expenses: [
                {
                    date: '2026-01-01',
                    description: 'Priceable first row',
                    currencyCode: 'EUR',
                    costMinor: '1000',
                    paidBy: 'Ana',
                    shares: [
                        { member: 'Ana', amountMinor: '500' },
                        { member: 'Bruno', amountMinor: '500' },
                    ],
                },
                {
                    date: '2026-01-02',
                    description: 'Unpriceable later row',
                    currencyCode: 'KPW',
                    costMinor: '1000',
                    paidBy: 'Bruno',
                    shares: [
                        { member: 'Ana', amountMinor: '500' },
                        { member: 'Bruno', amountMinor: '500' },
                    ],
                },
            ],
        }

        const result = await append<ApiError>(target.room.slug, body, target.memberToken)
        unsubscribe?.()

        expect(result.status).toBe(400)
        expect(result.body.error.code).toBe('IMPORT_CURRENCY_CONVERSION_UNSUPPORTED')
        expect(result.body.error.details).toEqual({ currencies: ['KPW'], targetCurrency: 'EUR' })
        expect(await prisma.member.count({ where: { roomId: target.room.id } })).toBe(1)
        expect(await prisma.expense.count({ where: { roomId: target.room.id } })).toBe(0)
        expect(await prisma.importBatch.count({ where: { roomId: target.room.id } })).toBe(0)
        expect(await importEvents(target.room.id)).toHaveLength(0)
        expect(pokes).toBe(0)
    })

    it("imports KUNC's 82 PLN toll into its EUR room with the cached Peanut cross-rate", async () => {
        const { body: target } = await newRoom({ name: 'KUNC', creatorName: 'You' })
        await prisma.fxRate.createMany({
            data: [
                ...FX_CORE.map((quote) => ({
                    base: 'EUR',
                    quote,
                    rate: STATIC_USD_PER_UNIT[quote] / STATIC_USD_PER_UNIT.EUR,
                    fetchedAt: new Date(),
                })),
                { base: 'EUR', quote: 'PLN', rate: 0.231481481481, fetchedAt: new Date() },
            ],
        })
        delete process.env.SPLIT_FX_MODE

        const result = await append(
            target.room.slug,
            {
                members: [
                    { sourceName: 'You', memberId: target.members[0].id },
                    { sourceName: 'Natalia Cieśla', newMemberName: 'Natalia Cieśla' },
                ],
                expenses: [
                    {
                        date: '2026-04-27',
                        description: 'Toll',
                        category: 'car',
                        currencyCode: 'PLN',
                        costMinor: '8200',
                        paidBy: 'Natalia Cieśla',
                        splitMode: 'EQUAL',
                        shares: [
                            { member: 'You', amountMinor: '4100' },
                            { member: 'Natalia Cieśla', amountMinor: '4100' },
                        ],
                    },
                ],
            },
            target.memberToken
        )

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({ addedExpenses: 1, addedMembers: 1, alreadyImported: false })
        expect(result.body.expenses).toHaveLength(1)
        expect(result.body.expenses[0]).toMatchObject({
            description: 'Toll',
            amountMinor: '8200',
            currency: 'PLN',
            baseAmountMinor: '1898',
            fxRate: '0.231481481481',
        })
        const you = result.body.members.find((member) => member.name === 'You')!
        const natalia = result.body.members.find((member) => member.name === 'Natalia Cieśla')!
        expect(result.body.balances).toMatchObject({ [you.id]: '-949', [natalia.id]: '949' })
    })

    it('refuses a custom-currency target before adding people, ledger rows or notifications', async () => {
        const { body: target } = await newRoom({ currency: 'BEER' })
        const body = bodyFor(source(), [
            { sourceName: 'Ana', memberId: target.members[0].id },
            { sourceName: 'Bruno', newMemberName: 'Bruno' },
            { sourceName: 'Carla', newMemberName: 'Carla' },
        ])
        let pokes = 0
        const unsubscribe = subscribe(target.room.id, () => {
            pokes += 1
        })

        const result = await append<ApiError>(target.room.slug, body, target.memberToken)
        unsubscribe?.()

        expect(result.status).toBe(400)
        expect(result.body.error).toMatchObject({
            code: 'IMPORT_TARGET_CURRENCY_UNSUPPORTED',
            message: expect.stringContaining('BEER'),
        })
        expect(await prisma.member.count({ where: { roomId: target.room.id } })).toBe(1)
        expect(await prisma.expense.count({ where: { roomId: target.room.id } })).toBe(0)
        expect(await prisma.importBatch.count({ where: { roomId: target.room.id } })).toBe(0)
        expect(await importEvents(target.room.id)).toHaveLength(0)
        expect(pokes).toBe(0)
    })

    it('refuses an EUR source into a KPW target absent from the static FX table before any side effect', async () => {
        const { body: target } = await newRoom({ currency: 'KPW' })
        const body = bodyFor(source(), [
            { sourceName: 'Ana', memberId: target.members[0].id },
            { sourceName: 'Bruno', newMemberName: 'Bruno' },
            { sourceName: 'Carla', newMemberName: 'Carla' },
        ])
        let pokes = 0
        const unsubscribe = subscribe(target.room.id, () => {
            pokes += 1
        })

        const result = await append<ApiError>(target.room.slug, body, target.memberToken)
        unsubscribe?.()

        expect(result.status).toBe(400)
        expect(result.body.error).toMatchObject({
            code: 'IMPORT_CURRENCY_CONVERSION_UNSUPPORTED',
            message: expect.stringMatching(/EUR.*KPW/),
        })
        expect(await prisma.member.count({ where: { roomId: target.room.id } })).toBe(1)
        expect(await prisma.expense.count({ where: { roomId: target.room.id } })).toBe(0)
        expect(await prisma.importBatch.count({ where: { roomId: target.room.id } })).toBe(0)
        expect(await importEvents(target.room.id)).toHaveLength(0)
        expect(pokes).toBe(0)
    })

    it('imports same-currency KPW rows into that static-unavailable target at identity', async () => {
        const { body: target } = await newRoom({ currency: 'KPW' })
        const parsed = source()
        const kpwSource: SplitwiseImport = {
            ...parsed,
            suggestedCurrency: 'KPW',
            currencies: ['KPW'],
            expenses: parsed.expenses.map((expense) => ({ ...expense, currencyCode: 'KPW' })),
        }
        const body = bodyFor(kpwSource, [
            { sourceName: 'Ana', memberId: target.members[0].id },
            { sourceName: 'Bruno', newMemberName: 'Bruno' },
            { sourceName: 'Carla', newMemberName: 'Carla' },
        ])
        let pokes = 0
        const unsubscribe = subscribe(target.room.id, () => {
            pokes += 1
        })

        const result = await append(target.room.slug, body, target.memberToken)
        unsubscribe?.()

        expect(result.status).toBe(200)
        expect(result.body).toMatchObject({ addedExpenses: 3, addedMembers: 2, alreadyImported: false })
        expect(result.body.expenses).toHaveLength(3)
        for (const expense of result.body.expenses) {
            expect(expense).toMatchObject({
                currency: 'KPW',
                fxRate: '1',
                baseAmountMinor: expense.amountMinor,
            })
        }
        expect(await prisma.member.count({ where: { roomId: target.room.id } })).toBe(3)
        expect(await prisma.expense.count({ where: { roomId: target.room.id } })).toBe(3)
        expect(await prisma.importBatch.count({ where: { roomId: target.room.id } })).toBe(1)
        expect(await importEvents(target.room.id)).toHaveLength(1)
        expect(pokes).toBe(1)
    })

    it('refuses a missing target without side effects', async () => {
        const { body: target } = await newRoom()
        const body = bodyFor(source(), [
            { sourceName: 'Ana', memberId: target.members[0].id },
            { sourceName: 'Bruno', newMemberName: 'Bruno' },
            { sourceName: 'Carla', newMemberName: 'Carla' },
        ])

        const missing = await append<ApiError>('missing-room-slug', body, target.memberToken)

        expect(missing.status).toBe(404)
        expect(missing.body.error.code).toBe('NOT_FOUND')
        expect(await prisma.member.count({ where: { roomId: target.room.id } })).toBe(1)
        expect(await prisma.expense.count({ where: { roomId: target.room.id } })).toBe(0)
        expect(await prisma.importBatch.count({ where: { roomId: target.room.id } })).toBe(0)
        expect(await importEvents(target.room.id)).toHaveLength(0)
    })

    it('serializes identical and distinct concurrent deliveries without duplicate or lost batches', async () => {
        const { body: target } = await newRoom()
        const { body: withBruno } = await addMember(target.room.slug, 'Bruno', target.memberToken)
        const { body: withCarla } = await addMember(target.room.slug, 'Carla', target.memberToken)
        const ids = new Map(withCarla.members.map((member) => [member.name, member.id]))
        const parsed = source()
        const base = bodyFor(parsed, [
            { sourceName: 'Ana', memberId: ids.get('Ana')! },
            { sourceName: 'Bruno', memberId: ids.get('Bruno')! },
            { sourceName: 'Carla', memberId: ids.get('Carla')! },
        ])
        let pokes = 0
        const unsubscribe = subscribe(target.room.id, () => {
            pokes += 1
        })

        const same = await Promise.all([
            append(target.room.slug, base, target.memberToken),
            append(target.room.slug, base, target.memberToken),
        ])
        expect(same.map((result) => result.status)).toEqual([200, 200])
        expect(same.map((result) => result.body.alreadyImported).sort()).toEqual([false, true])
        expect(new Set(same.map((result) => result.body.batchId)).size).toBe(1)

        const distinct = await Promise.all(
            ['Concurrent A', 'Concurrent B'].map((description) =>
                append(
                    target.room.slug,
                    {
                        ...base,
                        expenses: base.expenses.map((expense, index) =>
                            index === 0 ? { ...expense, description } : expense
                        ),
                    },
                    target.memberToken
                )
            )
        )
        unsubscribe?.()

        expect(distinct.map((result) => result.status)).toEqual([200, 200])
        expect(distinct.every((result) => result.body.alreadyImported === false)).toBe(true)
        expect(new Set(distinct.map((result) => result.body.batchId)).size).toBe(2)
        expect(await prisma.importBatch.count({ where: { roomId: target.room.id } })).toBe(3)
        expect(await prisma.expense.count({ where: { roomId: target.room.id } })).toBe(9)
        expect(await importEvents(target.room.id)).toHaveLength(3)
        expect(pokes).toBe(3)

        const timestamps = (
            await prisma.expense.findMany({
                where: { roomId: target.room.id, importBatchId: { not: null } },
                select: { createdAt: true },
                orderBy: { createdAt: 'asc' },
            })
        ).map((row) => row.createdAt.getTime())
        expect(new Set(timestamps).size).toBe(timestamps.length)
        for (let index = 1; index < timestamps.length; index++) {
            expect(timestamps[index]).toBeGreaterThan(timestamps[index - 1])
        }
    }, 15_000)
})
