/**
 * The import route, end to end against the real database.
 *
 * The load-bearing test in here is the round trip: take a Splitwise export, parse it, create the
 * room through the actual handler, and check Split's balances against the "Total balance" row the
 * file itself carries. That row is Splitwise's own arithmetic. If our number differs by a cent,
 * the import is wrong, and no amount of unit testing the pieces would have said so.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, truncateAll } from '@/server/test/db'
import { resetRateLimits } from '@/server/rateLimit'
import { importRoom } from '@/server/splitwiseImport'
import { roomStateBySlug } from '@/server/roomState'
import { POST as postImport } from '@/app/api/import/route'
import { MAX_EXPENSES, MAX_MEMBERS, parseSplitwiseCsv, type SplitwiseImport } from '@/lib/splitwise-csv'
import {
    LOCALISED_DECIMALS,
    MESSY_GROUP,
    MULTI_CURRENCY,
    MULTI_PAYER,
    QUOTED_FIELDS,
    SIMPLE_GROUP,
    WITH_PAYMENTS,
    generateGroup,
    generateLongHistory,
} from '@/lib/__fixtures__/splitwise'
import type { ApiError, RoomState, RoomStateWithMember } from '@/lib/api-types'

const BASE = 'http://localhost'
const post = async <T>(body: unknown): Promise<{ status: number; body: T }> => {
    const payload = JSON.stringify(body)
    const request = new Request(`${BASE}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) },
        body: payload,
    })
    const res = await postImport(request)
    return { status: res.status, body: (await res.json()) as T }
}

/**
 * The same POST with a streamed body and NO `content-length` — which is what
 * `Transfer-Encoding: chunked` produces, and what a declared-length check reads
 * as zero. Chunked on purpose: the cap has to hold mid-read, not on a blob that
 * was already buffered.
 */
const postChunked = async (payload: string) => {
    const encoder = new TextEncoder()
    const CHUNK = 64 * 1024
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (let at = 0; at < payload.length; at += CHUNK) {
                controller.enqueue(encoder.encode(payload.slice(at, at + CHUNK)))
            }
            controller.close()
        },
    })
    // `duplex` is required by Node for a streaming request body and is not in
    // the DOM's RequestInit.
    const request = new Request(`${BASE}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    const res = await postImport(request)
    return { status: res.status, body: (await res.json()) as ApiError }
}

/** The parsed file, as the browser would post it. */
const bodyFor = (parsed: SplitwiseImport, overrides: Record<string, unknown> = {}) => ({
    roomName: 'Imported group',
    emoji: '🧾',
    currency: parsed.suggestedCurrency,
    creatorName: parsed.members[0],
    members: parsed.members,
    expenses: parsed.expenses,
    ...overrides,
})

const balancesByName = (state: RoomState): Map<string, bigint> =>
    new Map(state.members.map((m) => [m.name, BigInt(state.balances[m.id] ?? '0')]))

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
})

describe('the imported room reproduces the export’s own Total balance row', () => {
    const files = { SIMPLE_GROUP, MULTI_PAYER, QUOTED_FIELDS, LOCALISED_DECIMALS, WITH_PAYMENTS, MESSY_GROUP }

    for (const [name, csv] of Object.entries(files)) {
        it(`${name}: every balance matches to the cent`, async () => {
            const parsed = parseSplitwiseCsv(csv)
            const { status, body } = await post<RoomStateWithMember>(bodyFor(parsed))
            expect(status).toBe(201)

            const balances = balancesByName(body)
            expect(parsed.totalBalance).not.toBeNull()
            for (const stated of parsed.totalBalance ?? []) {
                expect(`${stated.member}=${balances.get(stated.member)}`).toBe(`${stated.member}=${stated.netMinor}`)
            }
        })
    }

    /**
     * The same promise, for a group whose history does not fit. Two hundred of
     * these rows are never written — they arrive as an opening balance instead —
     * and every member still lands on the number the file's own summary row
     * states. This is the end-to-end version of the parser proof: if the carried
     * balance is wrong by a cent, it is wrong here too.
     */
    it('holds when two hundred rows were carried rather than imported', async () => {
        const parsed = parseSplitwiseCsv(generateLongHistory(700))
        expect(parsed.warnings.some((warning) => warning.code === 'TRUNCATED_HISTORY')).toBe(true)

        const { status, body } = await post<RoomStateWithMember>(bodyFor(parsed))
        expect(status).toBe(201)

        const balances = balancesByName(body)
        for (const stated of parsed.totalBalance ?? []) {
            expect(`${stated.member}=${balances.get(stated.member)}`).toBe(`${stated.member}=${stated.netMinor}`)
        }
        expect([...balances.values()].reduce((a, b) => a + b, 0n)).toBe(0n)
    }, 60_000)
})

describe('importing a group', () => {
    it('creates the room, the roster and the history in one call', async () => {
        const parsed = parseSplitwiseCsv(SIMPLE_GROUP)
        const { status, body } = await post<RoomStateWithMember>(bodyFor(parsed, { roomName: 'Ski trip' }))

        expect(status).toBe(201)
        expect(body.room.slug).toMatch(/^ski-trip-[a-z]{3,7}-[a-z]{3,7}-[a-z]{3,7}$/)
        expect(body.room.emoji).toBe('🧾')
        expect(body.members.map((m) => m.name)).toEqual(['Ana', 'Bruno', 'Carla'])
        expect(body.expenses).toHaveLength(3)

        const storedRoom = await prisma.room.findUniqueOrThrow({ where: { id: body.room.id } })
        const marked = body.expenses.find((expense) => expense.id === storedRoom.firstSharedBalanceExpenseId)
        expect(storedRoom.firstSharedBalanceExpenseId).not.toBeNull()
        expect(
            marked?.shares.some((share) => share.memberId !== marked.paidById && BigInt(share.amountMinor) > 0n)
        ).toBe(true)
    })

    it('hands the creator a member token, and nobody else’s', async () => {
        const parsed = parseSplitwiseCsv(SIMPLE_GROUP)
        const { body } = await post<RoomStateWithMember>(bodyFor(parsed, { creatorName: 'Bruno' }))

        expect(body.memberToken).toBeTruthy()
        expect(body.members.find((m) => m.id === body.memberId)?.name).toBe('Bruno')
        expect(JSON.stringify(body.expenses)).not.toContain(body.memberToken)
    })

    it('issues every member their own token, so joining later still works', async () => {
        const parsed = parseSplitwiseCsv(SIMPLE_GROUP)
        const { body } = await post<RoomStateWithMember>(bodyFor(parsed))
        const tokens = await prisma.member.findMany({ where: { roomId: body.room.id }, select: { token: true } })

        expect(new Set(tokens.map((t) => t.token)).size).toBe(3)
    })

    it('deals every imported member a distinct mascot and colour', async () => {
        const parsed = parseSplitwiseCsv(SIMPLE_GROUP)
        const { body } = await post<RoomStateWithMember>(bodyFor(parsed))

        expect(new Set(body.members.map((member) => member.avatar)).size).toBe(body.members.length)
        expect(new Set(body.members.map((member) => member.avatarPalette)).size).toBe(body.members.length)
    })

    it('keeps the date, the description and the category off the file', async () => {
        const parsed = parseSplitwiseCsv(SIMPLE_GROUP)
        const { body } = await post<RoomStateWithMember>(bodyFor(parsed))
        const dinner = body.expenses.find((e) => e.description === 'Dinner')

        expect(dinner?.date.slice(0, 10)).toBe('2026-01-02')
        expect(dinner?.category).toBe('Dining out')
        // 60.00 three ways is an even split, and the room says so — the edit
        // drawer opens in equal mode instead of showing three typed numbers.
        expect(dinner?.splitMode).toBe('EQUAL')
        expect(dinner?.shares.map((s) => s.amountMinor)).toEqual(['2000', '2000', '2000'])
        // "as typed" is meaningless when nobody typed them.
        expect(dinner?.shares.every((s) => s.enteredAmountMinor === null)).toBe(true)
    })

    it('leaves an uneven split EXACT, with the file\u2019s own numbers', async () => {
        // Ana fronts 100.00; Bruno owes 30, Carla owes 20, Ana carries 50.
        const parsed = parseSplitwiseCsv(
            'Date,Description,Category,Cost,Currency,Ana,Bruno,Carla\n2026-01-01,Dinner,Food,100.00,EUR,50.00,-30.00,-20.00\n'
        )
        const { body } = await post<RoomStateWithMember>(bodyFor(parsed))
        const dinner = body.expenses[0]

        expect(dinner.splitMode).toBe('EXACT')
        // Sorted, not in roster order: a bulk import writes every member in one
        // statement, so they share a `createdAt` and the wire order falls to the
        // uuid tie-break.
        expect(dinner.shares.map((s) => s.amountMinor).sort()).toEqual(['2000', '3000', '5000'])
        // Kept verbatim, which is what makes a re-save non-drifting.
        expect(dinner.shares.every((s) => s.enteredAmountMinor !== null)).toBe(true)
    })

    it('attributes every imported row to whoever ran the import', async () => {
        const parsed = parseSplitwiseCsv(SIMPLE_GROUP)
        const { body } = await post<RoomStateWithMember>(bodyFor(parsed, { creatorName: 'Carla' }))

        expect(body.expenses.every((e) => e.createdById === body.memberId)).toBe(true)
    })

    it('balances always net to zero, whatever the file did', async () => {
        for (const csv of [SIMPLE_GROUP, MULTI_PAYER, MULTI_CURRENCY, MESSY_GROUP]) {
            await truncateAll()
            resetRateLimits()
            const { body } = await post<RoomStateWithMember>(bodyFor(parseSplitwiseCsv(csv)))
            const total = Object.values(body.balances).reduce((a, b) => a + BigInt(b), 0n)
            expect(total).toBe(0n)
        }
    })

    it('converts a foreign-currency expense into the room currency and keeps the original', async () => {
        const parsed = parseSplitwiseCsv(MULTI_CURRENCY)
        const { body } = await post<RoomStateWithMember>(bodyFor(parsed))

        expect(body.room.currency).toBe('EUR')
        const skiPass = body.expenses.find((e) => e.description === 'Ski pass')
        expect(skiPass?.currency).toBe('CHF')
        expect(skiPass?.amountMinor).toBe('12000')
        // Static test table: CHF 1.12 / EUR 1.08 per USD.
        expect(skiPass?.baseAmountMinor).toBe('12444')
        expect(skiPass?.shares.reduce((a, s) => a + BigInt(s.amountMinor), 0n)).toBe(BigInt(skiPass?.baseAmountMinor!))
    })

    it('takes a five-hundred-expense file', async () => {
        const parsed = parseSplitwiseCsv(generateGroup(500, ['Ana', 'Bruno', 'Carla']))
        const { status, body } = await post<RoomStateWithMember>(bodyFor(parsed))

        expect(status).toBe(201)
        expect(body.expenses).toHaveLength(500)
        expect(Object.values(body.balances).reduce((a, b) => a + BigInt(b), 0n)).toBe(0n)
    })

    /**
     * A bulk import writes every row in one `createMany`, so a whole day's worth
     * of expenses share a `createdAt` to the millisecond. With only date and
     * createdAt to sort on, ties fell through to physical row order — and an
     * edit anywhere rewrote the page, teleporting a row twenty places up the
     * list under whoever was reading it. The id tiebreaker is what makes the
     * order arbitrary but STABLE.
     */
    it('keeps the same order across an unrelated edit, with every row written in one batch', async () => {
        const parsed = parseSplitwiseCsv(generateGroup(60, ['Ana', 'Bruno']))
        const { body: created } = await post<RoomStateWithMember>(bodyFor(parsed))
        const before = created.expenses.map((expense) => expense.id)

        // Same day, so the date cannot break the tie either.
        const sameDay = created.expenses.filter((expense) => expense.date === created.expenses[0].date)
        expect(sameDay.length).toBeGreaterThan(1)

        await prisma.expense.update({
            where: { id: sameDay[1].id },
            data: { description: 'Edited' },
        })

        const after = await roomStateBySlug(created.room.slug)
        expect(after.expenses.map((expense) => expense.id)).toEqual(before)
    })
})

describe('what the route refuses', () => {
    const parsed = () => parseSplitwiseCsv(SIMPLE_GROUP)

    it('refuses more expenses than a room holds', async () => {
        const one = parsed().expenses[0]
        const { status, body } = await post<ApiError>(
            bodyFor(parsed(), { expenses: Array.from({ length: 501 }, () => one) })
        )
        expect(status).toBe(400)
        expect(body.error.code).toBe('IMPORT_TOO_LARGE')
    })

    it('refuses more members than a room holds', async () => {
        const { status, body } = await post<ApiError>(
            bodyFor(parsed(), { members: Array.from({ length: 21 }, (_, i) => `P${i}`), creatorName: 'P0' })
        )
        expect(status).toBe(400)
        expect(body.error.code).toBe('IMPORT_TOO_LARGE')
    })

    it('refuses more shares than a room expense can hold', async () => {
        const file = parsed()
        const expense = file.expenses[0]
        const { status, body } = await post<ApiError>(
            bodyFor(file, {
                expenses: [
                    {
                        ...expense,
                        shares: Array.from({ length: MAX_MEMBERS + 1 }, (_, i) => ({
                            member: `P${i}`,
                            amountMinor: '1',
                        })),
                    },
                ],
            })
        )
        expect(status).toBe(400)
        expect(body.error.code).toBe('IMPORT_TOO_LARGE')
    })

    it('refuses shares that do not add up to the expense', async () => {
        const file = parsed()
        file.expenses[0].shares[0].amountMinor = '1'
        const { status, body } = await post<ApiError>(bodyFor(file))
        expect(status).toBe(400)
        expect(body.error.message).toMatch(/add up/)
    })

    it('refuses an impossible calendar day at the import route boundary', async () => {
        const file = parsed()
        file.expenses[0].date = '2026-02-31'

        const { status, body } = await post<ApiError>(bodyFor(file))

        expect(status).toBe(400)
        expect(body.error.code).toBe('VALIDATION_ERROR')
        expect(body.error.message).toContain('real calendar date')
        expect(await prisma.room.count()).toBe(0)
    })

    it('refuses a payer who is not on the roster', async () => {
        const file = parsed()
        file.expenses[0].paidBy = 'Nobody'
        const { status } = await post<ApiError>(bodyFor(file))
        expect(status).toBe(400)
    })

    it('refuses a share naming somebody who is not on the roster', async () => {
        const file = parsed()
        file.expenses[0].shares[0].member = 'Nobody'
        const { status } = await post<ApiError>(bodyFor(file))
        expect(status).toBe(400)
    })

    it('refuses a creator who is not on the roster', async () => {
        const { status } = await post<ApiError>(bodyFor(parsed(), { creatorName: 'Someone else' }))
        expect(status).toBe(400)
    })

    it('refuses a roster with the same name twice', async () => {
        const { status } = await post<ApiError>(bodyFor(parsed(), { members: ['Ana', 'ana', 'Bruno'] }))
        expect(status).toBe(400)
    })

    it('refuses an expense in a currency Split does not carry', async () => {
        const file = parsed()
        file.expenses[0].currencyCode = 'KPW'
        const { status } = await post<ApiError>(bodyFor(file))
        expect(status).toBe(400)
    })

    it('refuses a zero-amount expense', async () => {
        const file = parsed()
        file.expenses[0].costMinor = '0'
        file.expenses[0].shares = [{ member: 'Ana', amountMinor: '0' }]
        const { status } = await post<ApiError>(bodyFor(file))
        expect(status).toBe(400)
    })

    it('refuses numeric and out-of-range money before opening the import transaction', async () => {
        for (const amountMinor of [1000, '9223372036854775808']) {
            const file = parsed()
            file.expenses[0] = { ...file.expenses[0], costMinor: amountMinor as never }
            file.expenses[0].shares = [{ ...file.expenses[0].shares[0], amountMinor: amountMinor as never }]
            const { status } = await post<ApiError>(bodyFor(file))
            expect(status).toBe(400)
            expect(await prisma.room.count()).toBe(0)
        }
    })

    it('refuses an oversized body before reading it', async () => {
        const request = new Request(`${BASE}/api/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': '2000000' },
            body: JSON.stringify(bodyFor(parsed())),
        })
        const res = await postImport(request)
        expect(res.status).toBe(400)
        expect(((await res.json()) as ApiError).error.code).toBe('IMPORT_TOO_LARGE')
    })

    /** The bypass the declared-length check could never have caught: no header,
     *  so the old code read the size as 0 and buffered the lot. */
    it('refuses an oversized body that declares no length at all', async () => {
        const oversized = JSON.stringify(bodyFor(parsed(), { roomName: 'x'.repeat(1_200_000) }))
        const { status, body } = await postChunked(oversized)
        expect(status).toBe(400)
        expect(body.error.code).toBe('IMPORT_TOO_LARGE')
        expect(await prisma.room.count()).toBe(0)
    })

    it('still accepts an ordinary chunked body under the cap', async () => {
        const { status } = await postChunked(JSON.stringify(bodyFor(parsed())))
        expect(status).toBe(201)
    })

    it('rejects oversized arrays before deep schema validation amplifies their errors', async () => {
        const { status, body } = await post<ApiError>(
            bodyFor(parsed(), { expenses: Array.from({ length: 50_000 }, () => null) })
        )
        expect(status).toBe(400)
        expect(body.error.code).toBe('IMPORT_TOO_LARGE')
        expect(await prisma.room.count()).toBe(0)
    })

    it('writes nothing when it refuses', async () => {
        const file = parsed()
        file.expenses[0].paidBy = 'Nobody'
        await post<ApiError>(bodyFor(file))
        expect(await prisma.room.count()).toBe(0)
    })

    it('rate-limits imports as the room creations they are', async () => {
        for (let i = 0; i < 20; i++) {
            const { status } = await post<RoomStateWithMember>(bodyFor(parsed()))
            expect(status).toBe(201)
        }
        const { status, body } = await post<ApiError>(bodyFor(parsed()))
        expect(status).toBe(429)
        expect(body.error.code).toBe('RATE_LIMITED')
    })
})

describe('atomicity', () => {
    /**
     * The failure has to happen AFTER the room and the roster are written, or the test proves
     * nothing. Calling the service directly is what makes that reachable: the route's schema
     * rejects a payer who is not on the roster before anything runs, while `importRoom` only finds
     * out on the row it fails on — which is exactly the shape of a mid-batch failure.
     */
    it('leaves nothing behind when an expense fails halfway through the batch', async () => {
        const parsed = parseSplitwiseCsv(generateGroup(200, ['Ana', 'Bruno']))
        const expenses = parsed.expenses.map((e) => ({ ...e }))
        expenses[150].paidBy = 'Nobody'

        await expect(
            importRoom({
                roomName: 'Doomed import',
                emoji: null,
                currency: 'EUR',
                creatorName: 'Ana',
                members: parsed.members,
                expenses,
            })
        ).rejects.toThrow(/not a member/)

        expect(await prisma.room.count()).toBe(0)
        expect(await prisma.member.count()).toBe(0)
        expect(await prisma.expense.count()).toBe(0)
        expect(await prisma.expenseShare.count()).toBe(0)
    })

    it('commits everything or nothing — the successful twin of the same batch', async () => {
        const parsed = parseSplitwiseCsv(generateGroup(200, ['Ana', 'Bruno']))
        await importRoom({
            roomName: 'Good import',
            emoji: null,
            currency: 'EUR',
            creatorName: 'Ana',
            members: parsed.members,
            expenses: parsed.expenses,
        })

        expect(await prisma.expense.count()).toBe(200)
        expect(await prisma.expenseShare.count()).toBe(400)
    })
})
