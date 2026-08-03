/**
 * The import round trip, as a property: a ledger → the CSV Splitwise would have exported for it →
 * `parseSplitwiseCsv` → the same balances, to the cent, per currency.
 *
 * `splitwise-csv.test.ts` proves the parser against hand-written and recorded exports.
 * `server/test/import.test.ts` proves the written room reproduces a file's own Total balance row.
 * Neither runs the arithmetic BACKWARDS. This does: the generator starts from a ledger whose
 * balances are known by construction, renders the net-per-member format Splitwise actually
 * exports, and requires the parser to hand back a ledger with the identical balances.
 *
 * It is the failure mode nothing else catches — a parser that is self-consistent (shares always
 * sum to cost) and still wrong about who owes whom.
 */
import { describe, expect, it } from 'vitest'
import { decimalsOf, formatMinorPlain } from '@/lib/money'
import { parseSplitwiseCsv, type ParsedExpense } from '@/lib/splitwise-csv'

// ─── generator ───────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
    }
}

const between = (rng: () => number, low: number, high: number): number => low + Math.floor(rng() * (high - low + 1))
const pick = <T>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)]

/** Two-decimal, zero-decimal and three-decimal, so the rendering crosses every decimals bucket. */
const CURRENCIES = ['EUR', 'USD', 'JPY', 'KWD'] as const

/** Descriptions that exercise the RFC 4180 half of the parser on real rows rather than fixtures. */
const DESCRIPTIONS = [
    'Dinner',
    'Taxi, airport',
    'Museum "free" entry',
    'Groceries\nand beer',
    'Café ☕',
    'Rent',
] as const

interface Row {
    currency: string
    cost: bigint
    payer: number
    /** Per-member share, index-aligned with the roster; sums to `cost`. */
    shares: bigint[]
    description: string
}

function randomParts(rng: () => number, total: bigint, count: number): bigint[] {
    const cuts = Array.from({ length: count - 1 }, () => BigInt(between(rng, 0, Number(total)))).sort((a, b) =>
        a === b ? 0 : a < b ? -1 : 1
    )
    const bounds = [0n, ...cuts, total]
    return Array.from({ length: count }, (_, index) => bounds[index + 1] - bounds[index])
}

/**
 * A group whose rows each have exactly one payer whose net is strictly positive — the shape a
 * Splitwise export of a single-payer expense always has, and the one the derivation is exact for.
 * Multi-payer rows are a reconstruction the parser flags; they get their own test below.
 */
function randomGroup(rng: () => number, seed: number) {
    const members = Array.from({ length: between(rng, 2, 6) }, (_, index) => `Member ${seed}-${index}`)
    const rows: Row[] = Array.from({ length: between(rng, 1, 14) }, () => {
        const currency = pick(rng, CURRENCIES)
        const cost = BigInt(between(rng, 2, 900_000))
        const payer = between(rng, 0, members.length - 1)
        const participants = members.map((_, index) => index).filter(() => rng() < 0.75)
        if (!participants.includes(payer)) participants.push(payer)
        if (participants.length < 2) participants.push((payer + 1) % members.length)
        const unique = [...new Set(participants)]

        const parts = randomParts(rng, cost, unique.length)
        const shares = members.map(() => 0n)
        unique.forEach((index, position) => {
            shares[index] = parts[position]
        })
        // The payer must come out ahead or the row has no positive column and Splitwise's own
        // format cannot say who paid. Hand one unit of their share to somebody else.
        if (shares[payer] === cost) {
            const other = unique.find((index) => index !== payer)!
            shares[payer] -= 1n
            shares[other] += 1n
        }
        return { currency, cost, payer, shares, description: pick(rng, DESCRIPTIONS) }
    })
    return { members, rows }
}

/** Net per member for one row, exactly as Splitwise defines it: paid minus owed. */
const netsOf = (row: Row): bigint[] =>
    row.shares.map((share, index) => (index === row.payer ? row.cost - share : -share))

const csvCell = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/** The generated ledger, rendered the way a Splitwise group export renders it. */
function toSplitwiseCsv(group: ReturnType<typeof randomGroup>, withTotalRow = true): string {
    const header = ['Date', 'Description', 'Category', 'Cost', 'Currency', ...group.members]
    const lines = [header.map(csvCell).join(',')]

    for (const row of group.rows) {
        const decimals = decimalsOf(row.currency)
        lines.push(
            [
                '2026-07-14',
                csvCell(row.description),
                'General',
                formatMinorPlain(row.cost.toString(), decimals),
                row.currency,
                ...netsOf(row).map((net) => formatMinorPlain(net.toString(), decimals)),
            ].join(',')
        )
    }

    if (withTotalRow) {
        // Splitwise writes one Total balance row, in the group's own currency, so it is only
        // meaningful for a single-currency file. `expectedNets` below is the general form.
        const decimals = decimalsOf(group.rows[0].currency)
        const totals = group.members.map((_, index) => group.rows.reduce((sum, row) => sum + netsOf(row)[index], 0n))
        lines.push(
            [
                'Total balance',
                '',
                '',
                formatMinorPlain('0', decimals),
                group.rows[0].currency,
                ...totals.map((total) => formatMinorPlain(total.toString(), decimals)),
            ].join(',')
        )
    }
    return `${lines.join('\n')}\n`
}

/** What the group's balances are, by construction, per currency. */
function expectedNets(group: ReturnType<typeof randomGroup>): Map<string, Map<string, bigint>> {
    const byCurrency = new Map<string, Map<string, bigint>>()
    for (const row of group.rows) {
        const nets = netsOf(row)
        const bucket = byCurrency.get(row.currency) ?? new Map(group.members.map((name) => [name, 0n]))
        group.members.forEach((name, index) => bucket.set(name, (bucket.get(name) ?? 0n) + nets[index]))
        byCurrency.set(row.currency, bucket)
    }
    return byCurrency
}

/** The same fold, run over what the parser gave back. */
function parsedNets(members: readonly string[], expenses: readonly ParsedExpense[]): Map<string, Map<string, bigint>> {
    const byCurrency = new Map<string, Map<string, bigint>>()
    for (const expense of expenses) {
        const bucket = byCurrency.get(expense.currencyCode) ?? new Map(members.map((name) => [name, 0n]))
        bucket.set(expense.paidBy, (bucket.get(expense.paidBy) ?? 0n) + BigInt(expense.costMinor))
        for (const share of expense.shares) {
            bucket.set(share.member, (bucket.get(share.member) ?? 0n) - BigInt(share.amountMinor))
        }
        byCurrency.set(expense.currencyCode, bucket)
    }
    return byCurrency
}

const SEEDS = 150

// ─── the property ────────────────────────────────────────────────────────────

describe('ledger → Splitwise CSV → import — property', () => {
    it('reproduces every balance to the cent, in every currency, for 150 generated groups', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const group = randomGroup(mulberry32(seed), seed)
            const parsed = parseSplitwiseCsv(toSplitwiseCsv(group))

            expect(`${seed}:${parsed.members.join('|')}`).toBe(`${seed}:${group.members.join('|')}`)

            const expected = expectedNets(group)
            const actual = parsedNets(group.members, parsed.expenses)
            for (const [currency, nets] of expected) {
                for (const [member, net] of nets) {
                    const label = `${seed}:${currency}:${member}`
                    expect(`${label}=${actual.get(currency)?.get(member) ?? 0n}`).toBe(`${label}=${net}`)
                }
            }
        }
    })

    it('never drops a row it was handed, and every expense reconstructs its own total', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const group = randomGroup(mulberry32(seed), seed)
            const parsed = parseSplitwiseCsv(toSplitwiseCsv(group))

            // One payer per row means one expense per row: nothing is dropped and nothing is split.
            expect(`${seed}:${parsed.expenses.length}`).toBe(`${seed}:${group.rows.length}`)
            for (const expense of parsed.expenses) {
                const sum = expense.shares.reduce((total, share) => total + BigInt(share.amountMinor), 0n)
                expect(`${seed}:${expense.description}=${sum}`).toBe(
                    `${seed}:${expense.description}=${expense.costMinor}`
                )
                expect(BigInt(expense.costMinor) > 0n).toBe(true)
            }
            // No row-level complaint: these files are exactly what the format says.
            const rowWarnings = parsed.warnings.filter((warning) => warning.code.startsWith('ROW_'))
            expect(`${seed}:${rowWarnings.map((warning) => warning.code).join(',')}`).toBe(`${seed}:`)
        }
    })

    it('agrees with the file’s own Total balance row wherever the file states one', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const rng = mulberry32(seed)
            const group = randomGroup(rng, seed)
            // Single-currency only: the Total balance row has one currency column, so a mixed file
            // cannot state a meaningful one — which is why the parser refuses to check it there.
            const single = { ...group, rows: group.rows.map((row) => ({ ...row, currency: 'EUR' })) }
            const parsed = parseSplitwiseCsv(toSplitwiseCsv(single))

            expect(parsed.totalBalance).not.toBeNull()
            const actual = parsedNets(single.members, parsed.expenses).get('EUR')!
            for (const stated of parsed.totalBalance!) {
                const label = `${seed}:${stated.member}`
                expect(`${label}=${actual.get(stated.member) ?? 0n}`).toBe(`${label}=${stated.netMinor}`)
            }
        }
    })

    it('carries the same balances through a file with no Total balance row at all', () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
            const group = randomGroup(mulberry32(seed), seed)
            const parsed = parseSplitwiseCsv(toSplitwiseCsv(group, false))

            expect(parsed.totalBalance).toBeNull()
            const expected = expectedNets(group)
            const actual = parsedNets(group.members, parsed.expenses)
            for (const [currency, nets] of expected) {
                for (const [member, net] of nets) {
                    const label = `${seed}:${currency}:${member}`
                    expect(`${label}=${actual.get(currency)?.get(member) ?? 0n}`).toBe(`${label}=${net}`)
                }
            }
        }
    })
})

describe('multi-payer rows — the reconstruction still owes the same money', () => {
    /**
     * When two people fronted one row, Splitwise's own export cannot say who paid what, so the
     * parser splits the row into one expense per payer. Per-expense attribution is a
     * reconstruction and the UI says so; the BALANCES are not, and this is that promise.
     */
    it('reproduces every member’s net across the row, however the parts were cut', () => {
        let checked = 0
        for (let seed = 1; seed <= 120; seed++) {
            const rng = mulberry32(seed)
            const members = Array.from({ length: between(rng, 3, 6) }, (_, index) => `Member ${index}`)
            const cost = BigInt(between(rng, 100, 500_000))

            // Two or three payers, each fronting a slice, with the whole row owed by everybody.
            const payerCount = between(rng, 2, Math.min(3, members.length - 1))
            const paidParts = randomParts(rng, cost, payerCount).map((part) => (part === 0n ? 1n : part))
            const paid = members.map(() => 0n)
            for (let index = 0; index < payerCount; index++) paid[index] = paidParts[index]
            // Keep the row's total honest after the zero-repair above.
            const drift = paid.reduce((a, b) => a + b, 0n) - cost
            paid[0] -= drift
            if (paid[0] <= 0n) continue

            const owedParts = randomParts(rng, cost, members.length)
            const nets = members.map((_, index) => paid[index] - owedParts[index])
            if (nets.reduce((a, b) => a + b, 0n) !== 0n) continue
            if (nets.filter((net) => net > 0n).length < 2) continue

            const csv = [
                ['Date', 'Description', 'Category', 'Cost', 'Currency', ...members].join(','),
                [
                    '2026-07-14',
                    'Shared bill',
                    'General',
                    formatMinorPlain(cost.toString(), 2),
                    'EUR',
                    ...nets.map((net) => formatMinorPlain(net.toString(), 2)),
                ].join(','),
                '',
            ].join('\n')

            const parsed = parseSplitwiseCsv(csv)
            const actual = parsedNets(members, parsed.expenses).get('EUR')!
            members.forEach((member, index) => {
                expect(`${seed}:${member}=${actual.get(member) ?? 0n}`).toBe(`${seed}:${member}=${nets[index]}`)
            })
            // The parts add back up to the row.
            const total = parsed.expenses.reduce((sum, expense) => sum + BigInt(expense.costMinor), 0n)
            expect(`${seed}:${total}`).toBe(`${seed}:${cost}`)
            expect(parsed.warnings.some((warning) => warning.code === 'MULTI_PAYER_SPLIT')).toBe(true)
            checked++
        }
        // The generator rejects rows that cannot be multi-payer; a run where none survived would
        // be a green test proving nothing.
        expect(checked).toBeGreaterThan(30)
    })
})
