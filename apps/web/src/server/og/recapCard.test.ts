import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma, truncateAll } from '@/server/test/db'
import { resetRateLimits } from '@/server/rateLimit'
import { isAvatarKey } from '@/lib/avatars'
import { type RoomWithRelations } from '@/server/roomState'
import { BODY_CHARS, DISPLAY_CHARS } from '@/server/og/fonts'
import { MEMBER_FALLBACK } from '@/server/og/roomCard'
import {
    isSettled,
    loadRecap,
    recapStatLine,
    toRecapCard,
    toRoomRecap,
    topPayerName,
    type RecapRoomRow,
    type RoomRecap,
} from '@/server/og/recapCard'
import { RECAP_FALLBACK_TITLE, recapTitle } from '@/server/og/roomMeta'
import { POST as postRoom } from '@/app/api/rooms/route'
import { POST as postMember } from '@/app/api/rooms/[slug]/members/route'
import { POST as postExpense } from '@/app/api/rooms/[slug]/expenses/route'
import { DELETE as deleteExpense } from '@/app/api/rooms/[slug]/expenses/[id]/route'
import { POST as postSettlement } from '@/app/api/rooms/[slug]/settlements/route'
import type { RoomState, RoomStateWithMember } from '@/lib/api-types'

const drawableByDisplay = (value: string) => [...value].every((ch) => DISPLAY_CHARS.has(ch))
const drawableByBody = (value: string) => [...value].every((ch) => BODY_CHARS.has(ch))

const date = (iso: string) => new Date(iso)

// ------------------------------------------------------------------ pure bits

describe('topPayerName', () => {
    const members = [
        { id: 'a', name: 'Ana' },
        { id: 'm', name: 'María' },
        { id: 'z', name: 'Zoë' },
    ]

    it('is nobody when nothing was spent', () => {
        expect(topPayerName(members, [])).toBeNull()
    })

    it('sums what each person fronted rather than counting rows', () => {
        const expenses = [
            { paidById: 'a', baseAmountMinor: 400n },
            { paidById: 'a', baseAmountMinor: 400n },
            { paidById: 'm', baseAmountMinor: 900n },
        ]
        expect(topPayerName(members, expenses)).toBe('María')
    })

    it('breaks a tie on the name, deterministically', () => {
        const expenses = [
            { paidById: 'm', baseAmountMinor: 500n },
            { paidById: 'z', baseAmountMinor: 500n },
        ]
        expect(topPayerName(members, expenses)).toBe('María')
        // Roster order must not decide it either.
        expect(topPayerName([...members].reverse(), expenses)).toBe('María')
    })

    it('skips a payer who is not on the roster', () => {
        const expenses = [
            { paidById: 'ghost', baseAmountMinor: 10_000n },
            { paidById: 'a', baseAmountMinor: 100n },
        ]
        expect(topPayerName(members, expenses)).toBe('Ana')
    })

    it('is nobody when every expense was zero', () => {
        expect(topPayerName(members, [{ paidById: 'a', baseAmountMinor: 0n }])).toBeNull()
    })
})

describe('recapStatLine', () => {
    it('reads naturally in the singular', () => {
        expect(recapStatLine({ dayCount: 1, expenseCount: 1, memberCount: 1 })).toBe('1 day · 1 expense · 1 person')
    })

    it('reads the way the card promises', () => {
        expect(recapStatLine({ dayCount: 9, expenseCount: 14, memberCount: 6 })).toBe('9 days · 14 expenses · 6 people')
    })

    it('drops the day count rather than print "0 days"', () => {
        expect(recapStatLine({ dayCount: 0, expenseCount: 0, memberCount: 3 })).toBe('0 expenses · 3 people')
    })
})

// ------------------------------------------------------------- the settled fold

/**
 * `isSettled` folds through `roomState.balancesOf` itself now — there is one
 * definition of a balance and this is a consumer of it, so what is left to test
 * is the "AND had something to square" rule, which is this module's own.
 */
describe('isSettled', () => {
    type ExpenseFixture = { paidById: string; baseAmountMinor: bigint; shares: [string, bigint][] }
    type SettlementFixture = { fromId: string; toId: string; amountMinor: bigint }

    const room = (memberIds: string[], expenses: ExpenseFixture[], settlements: SettlementFixture[] = []) =>
        ({
            members: memberIds.map((id) => ({ id })),
            expenses: expenses.map((e) => ({
                paidById: e.paidById,
                baseAmountMinor: e.baseAmountMinor,
                shares: e.shares.map(([memberId, amountMinor]) => ({ memberId, amountMinor })),
            })),
            settlements,
        }) as unknown as RoomWithRelations

    const cases: RoomWithRelations[] = [
        room(
            ['a', 'b', 'c'],
            [
                {
                    paidById: 'a',
                    baseAmountMinor: 1000n,
                    shares: [
                        ['a', 334n],
                        ['b', 333n],
                        ['c', 333n],
                    ],
                },
            ]
        ),
        room(
            ['a', 'b'],
            [
                {
                    paidById: 'a',
                    baseAmountMinor: 1000n,
                    shares: [
                        ['a', 500n],
                        ['b', 500n],
                    ],
                },
            ],
            [{ fromId: 'b', toId: 'a', amountMinor: 500n }]
        ),
        room(
            ['a'],
            [
                {
                    paidById: 'a',
                    baseAmountMinor: 100n,
                    shares: [
                        ['a', 50n],
                        ['ghost', 50n],
                    ],
                },
            ]
        ),
        room([], [], []),
    ]

    it('calls a room settled only when it is square AND had something to square', () => {
        expect(isSettled(cases[0])).toBe(false)
        expect(isSettled(cases[1])).toBe(true)
        // An empty room is empty, not settled — the card must not claim a result
        // that never happened.
        expect(isSettled(cases[3])).toBe(false)
    })
})

// ------------------------------------------------------------------ the shapes

const row = (overrides: Partial<RecapRoomRow> = {}): RecapRoomRow => ({
    name: 'Ski trip 🎿',
    emoji: '🎿',
    currency: 'EUR',
    members: [
        { id: 'a', name: 'Ana' },
        { id: 'm', name: 'María' },
    ],
    expenses: [
        {
            baseAmountMinor: 200_000n,
            paidById: 'm',
            date: date('2026-02-01T10:00:00Z'),
            shares: [
                { memberId: 'a', amountMinor: 100_000n },
                { memberId: 'm', amountMinor: 100_000n },
            ],
        },
        {
            baseAmountMinor: 34_000n,
            paidById: 'a',
            date: date('2026-02-09T18:00:00Z'),
            shares: [
                { memberId: 'a', amountMinor: 17_000n },
                { memberId: 'm', amountMinor: 17_000n },
            ],
        },
    ],
    settlements: [],
    ...overrides,
})

describe('toRoomRecap', () => {
    it('derives the trip out of the raw rows', () => {
        const recap = toRoomRecap(row())
        expect(recap.totalMinor).toBe('234000')
        expect(recap.expenseCount).toBe(2)
        expect(recap.memberCount).toBe(2)
        expect(recap.dayCount).toBe(9)
        expect(recap.topPayerName).toBe('María')
        expect(recap.settled).toBe(false)
        // Raw, not sanitized — the HTML page has no glyph budget.
        expect(recap.name).toBe('Ski trip 🎿')
    })

    it('invents nothing for an empty room', () => {
        const recap = toRoomRecap(row({ expenses: [], members: [] }))
        expect(recap.totalMinor).toBe('0')
        expect(recap.dayCount).toBe(0)
        expect(recap.topPayerName).toBeNull()
        expect(recap.settled).toBe(false)
        expect(recap.members).toEqual([])
    })

    it('is settled once the debt has been paid back', () => {
        const recap = toRoomRecap(row({ settlements: [{ fromId: 'a', toId: 'm', amountMinor: 83_000n }] }))
        expect(recap.settled).toBe(true)
    })
})

describe('toRecapCard', () => {
    const recapOf = (overrides: Partial<RecapRoomRow> = {}): RoomRecap => toRoomRecap(row(overrides))

    it('reduces the trip to strings the card can draw', () => {
        const card = toRecapCard(recapOf())
        expect(card.name).toBe('Ski trip')
        expect(card.total).toBe('€2340.00')
        expect(card.stat).toBe('9 days · 2 expenses · 2 people')
        expect(card.topPayer).toBe('María fronted the most')
        // A legacy row carries no avatar key; the card passes the null through and the disc
        // falls back, rather than inventing a face the recap page would not draw.
        expect(card.personas).toEqual([null, null])
        expect(card.overflow).toBe(0)
    })

    it('gives every member their own persona rather than a letter', () => {
        const card = toRecapCard(
            recapOf({
                members: [
                    { id: 'a', name: 'Ana', avatar: 'wizard-frog' },
                    { id: 'm', name: 'María', avatar: 'moon-bunny' },
                ],
            })
        )
        expect(card.personas).toEqual(['wizard-frog', 'moon-bunny'])
    })

    it('sanitizes a hostile room name instead of drawing blank boxes', () => {
        const card = toRecapCard(recapOf({ name: 'Кипр 2026' }))
        expect(card.name).toBe('A split')
        expect(drawableByDisplay(card.name)).toBe(true)
    })

    it('carries a stored doodle name through as the emblem', () => {
        const card = toRecapCard(recapOf({ emoji: 'pizza' }))
        expect(card.emblem).toBe('pizza')
    })

    it('translates a legacy emoji emblem to its drawing', () => {
        const card = toRecapCard(recapOf({ emoji: '🎿' }))
        expect(card.emblem).toBe('ski')
    })

    it('falls back to the peanut for junk emblems, exactly like RoomEmblem does', () => {
        expect(toRecapCard(recapOf({ emoji: '🦖', name: 'Ski trip' })).emblem).toBe('peanut')
        expect(toRecapCard(recapOf({ emoji: null, name: 'zzz' })).emblem).toBe('peanut')
    })

    it('sanitizes a hostile member name inside the top-payer line', () => {
        const card = toRecapCard(
            recapOf({
                members: [
                    { id: 'a', name: 'Ana' },
                    { id: 'm', name: '東京🎿' },
                ],
            })
        )
        expect(card.topPayer).toBe(`${MEMBER_FALLBACK} fronted the most`)
        expect(drawableByBody(card.topPayer as string)).toBe(true)
    })

    it('swaps an undrawable currency symbol for the ISO code', () => {
        // `฿` is outside Sniglet — a gap in the hero number would read as a bug.
        const card = toRecapCard(recapOf({ currency: 'THB' }))
        expect(card.total).toBe('2340.00 THB')
        expect(drawableByBody(card.total)).toBe(true)
    })

    it('every string it emits is drawable', () => {
        for (const currency of ['USD', 'EUR', 'GBP', 'BRL', 'CHF', 'THB', 'JPY', 'COP']) {
            const card = toRecapCard(recapOf({ currency }))
            expect(drawableByBody(card.total)).toBe(true)
            expect(drawableByBody(card.stat)).toBe(true)
            expect(drawableByDisplay(card.name)).toBe(true)
            // The faces carry no text at all now — a persona is a drawing, so there is no
            // codepoint for the two shipped fonts to be missing.
        }
    })

    it('keeps quiet about the top payer in a room of one', () => {
        const solo = recapOf({
            members: [{ id: 'a', name: 'Ana' }],
            expenses: [
                {
                    baseAmountMinor: 1000n,
                    paidById: 'a',
                    date: date('2026-02-01T10:00:00Z'),
                    shares: [{ memberId: 'a', amountMinor: 1000n }],
                },
            ],
        })
        // True, and it reads as a bug: there was nobody to front more than.
        expect(solo.topPayerName).toBe('Ana')
        expect(toRecapCard(solo).topPayer).toBeNull()
    })

    it('collapses a big roster into +N', () => {
        const many = recapOf({ members: Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, name: `Member ${i}` })) })
        expect(toRecapCard(many).personas).toHaveLength(6)
        expect(toRecapCard(many).overflow).toBe(3)
    })

    it('stamps SETTLED only on a room that reached zero', () => {
        expect(toRecapCard(recapOf()).settled).toBe(false)
        expect(toRecapCard(recapOf({ settlements: [{ fromId: 'a', toId: 'm', amountMinor: 83_000n }] })).settled).toBe(
            true
        )
    })
})

describe('recapTitle', () => {
    it('keeps legacy emoji out of text metadata', () => {
        expect(recapTitle('Ski trip', '🎿')).toBe('Ski trip recap — Peanut Split')
    })

    it('keeps non-Latin names — HTML has no glyph budget', () => {
        expect(recapTitle('Кипр 2026', null)).toBe('Кипр 2026 recap — Peanut Split')
    })

    it('falls back when the name is empty', () => {
        expect(recapTitle('  ', null)).toBe(RECAP_FALLBACK_TITLE)
    })
})

// -------------------------------------------------------------- against the DB

type Params = Record<string, string>
type Handler = (request: Request, ctx: { params: Promise<Params> }) => Promise<Response>

const call = async <T>(
    handler: Handler,
    opts: { path: string; method?: string; body?: unknown; params?: Params }
): Promise<T> => {
    const request = new Request(`http://localhost${opts.path}`, {
        method: opts.method ?? 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
    const res = await handler(request, { params: Promise.resolve(opts.params ?? {}) })
    return (await res.json()) as T
}

describe('loadRecap', () => {
    beforeEach(async () => {
        await truncateAll()
        resetRateLimits()
    })

    afterAll(async () => {
        await prisma.$disconnect()
    })

    const setUp = async () => {
        const created = await call<RoomStateWithMember>(postRoom as Handler, {
            path: '/api/rooms',
            method: 'POST',
            body: { name: 'Ski trip', emoji: '🎿', currency: 'EUR', creatorName: 'Ana' },
        })
        const slug = created.room.slug
        const withMaria = await call<RoomStateWithMember>(postMember as Handler, {
            path: `/api/rooms/${slug}/members`,
            method: 'POST',
            params: { slug },
            body: { name: 'Maria' },
        })
        const ana = created.memberId
        const maria = withMaria.memberId
        const expense = (amountMinor: string, paidById: string, isoDate: string) =>
            call<RoomState>(postExpense as Handler, {
                path: `/api/rooms/${slug}/expenses`,
                method: 'POST',
                params: { slug },
                body: {
                    description: 'Lift pass',
                    amountMinor,
                    currency: 'EUR',
                    paidById,
                    splitMode: 'EQUAL',
                    date: isoDate,
                },
            })
        return { slug, ana, maria, expense }
    }

    it('is null for an unknown slug, so a dead link never becomes a 500', async () => {
        expect(await loadRecap('nope-123456')).toBeNull()
    })

    it('reads a live room out of one query', async () => {
        const { slug, maria, expense } = await setUp()
        await expense('200000', maria, '2026-02-01T10:00:00.000Z')
        await expense('34000', maria, '2026-02-09T18:00:00.000Z')

        const recap = await loadRecap(slug)
        expect(recap).not.toBeNull()
        expect(recap?.totalMinor).toBe('234000')
        expect(recap?.expenseCount).toBe(2)
        expect(recap?.dayCount).toBe(9)
        expect(recap?.members.map((member) => member.name)).toEqual(['Ana', 'Maria'])
        // The M6 regression guard: the query used to select only `{ id, name }`, so every face on
        // the recap drew the same fallback peanut. Reading a real persona key back proves the
        // avatar survives the round trip.
        expect(recap?.members.every((member) => isAvatarKey(member.avatar))).toBe(true)
        expect(recap?.topPayerName).toBe('Maria')
        expect(recap?.settled).toBe(false)
    })

    it('leaves a soft-deleted expense out of the total, the count and the span', async () => {
        const { slug, maria, expense } = await setUp()
        await expense('10000', maria, '2026-02-01T10:00:00.000Z')
        const doomed = await expense('90000', maria, '2026-03-20T10:00:00.000Z')
        const doomedId = doomed.expenses.find((e) => BigInt(e.baseAmountMinor) === 90_000n)?.id as string

        await call(deleteExpense as Handler, {
            path: `/api/rooms/${slug}/expenses/${doomedId}`,
            method: 'DELETE',
            params: { slug, id: doomedId },
        })

        const recap = await loadRecap(slug)
        expect(recap?.totalMinor).toBe('10000')
        expect(recap?.expenseCount).toBe(1)
        // The deleted expense was the far end of the trip; the span must forget it too.
        expect(recap?.dayCount).toBe(1)
    })

    it('reports settled once the suggested transfer has been recorded', async () => {
        const { slug, expense, maria } = await setUp()
        const state = await expense('10000', maria, '2026-02-01T10:00:00.000Z')
        const transfer = state.suggestedTransfers[0]
        await call<RoomState>(postSettlement as Handler, {
            path: `/api/rooms/${slug}/settlements`,
            method: 'POST',
            params: { slug },
            body: { ...transfer, method: 'cash' },
        })

        const recap = await loadRecap(slug)
        expect(recap?.settled).toBe(true)
        expect(recap?.settlementCount).toBe(1)
        expect(toRecapCard(recap as RoomRecap).settled).toBe(true)
    })
})
