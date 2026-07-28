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
import { POST as postImport } from '@/app/api/import/route'
import { parseSplitwiseCsv, type SplitwiseImport } from '@/lib/splitwise-csv'
import {
    LOCALISED_DECIMALS,
    MESSY_GROUP,
    MULTI_CURRENCY,
    MULTI_PAYER,
    QUOTED_FIELDS,
    SIMPLE_GROUP,
    WITH_PAYMENTS,
    generateGroup,
} from '@/lib/splitwise-fixtures'
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
})

describe('importing a group', () => {
    it('creates the room, the roster and the history in one call', async () => {
        const parsed = parseSplitwiseCsv(SIMPLE_GROUP)
        const { status, body } = await post<RoomStateWithMember>(bodyFor(parsed, { roomName: 'Ski trip' }))

        expect(status).toBe(201)
        expect(body.room.slug).toMatch(/^ski-trip-[0-9a-hjkmnp-tv-z]{6}$/)
        expect(body.room.emoji).toBe('🧾')
        expect(body.members.map((m) => m.name)).toEqual(['Ana', 'Bruno', 'Carla'])
        expect(body.expenses).toHaveLength(3)
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

    it('keeps the date, the description and the category off the file', async () => {
        const parsed = parseSplitwiseCsv(SIMPLE_GROUP)
        const { body } = await post<RoomStateWithMember>(bodyFor(parsed))
        const dinner = body.expenses.find((e) => e.description === 'Dinner')

        expect(dinner?.date.slice(0, 10)).toBe('2026-01-02')
        expect(dinner?.category).toBe('Dining out')
        expect(dinner?.splitMode).toBe('EXACT')
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
})

describe('what the route refuses', () => {
    const parsed = () => parseSplitwiseCsv(SIMPLE_GROUP)

    it('refuses more expenses than a room holds', async () => {
        const one = parsed().expenses[0]
        const { status, body } = await post<ApiError>(
            bodyFor(parsed(), { expenses: Array.from({ length: 501 }, () => one) })
        )
        expect(status).toBe(400)
        expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('refuses more members than a room holds', async () => {
        const { status } = await post<ApiError>(
            bodyFor(parsed(), { members: Array.from({ length: 21 }, (_, i) => `P${i}`), creatorName: 'P0' })
        )
        expect(status).toBe(400)
    })

    it('refuses shares that do not add up to the expense', async () => {
        const file = parsed()
        file.expenses[0].shares[0].amountMinor = '1'
        const { status, body } = await post<ApiError>(bodyFor(file))
        expect(status).toBe(400)
        expect(body.error.message).toMatch(/add up/)
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
        file.expenses[0].currencyCode = 'INR'
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
