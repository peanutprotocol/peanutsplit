/**
 * Splitwise group-export → Split expenses. Pure, dependency-free, runs identically in the browser
 * and on the server, and is the only place that knows what a Splitwise CSV looks like.
 *
 * WHY NO CSV LIBRARY. Every candidate (papaparse, csv-parse, neat-csv) is a new dependency on a
 * repo with a 14-day release-age floor in `.npmrc`, shipped to the client, for a job that RFC 4180
 * describes in one paragraph: quoted fields, doubled quotes inside them, commas and newlines that
 * only separate when unquoted. `parseCsvRows` below is that paragraph, and it is tested against the
 * cases a library would be trusted for. A parser this size is cheaper to own than to audit.
 *
 * WHAT SPLITWISE ACTUALLY EXPORTS. A group export is:
 *
 *     Date,Description,Category,Cost,Currency,Ana,Bruno,Carla
 *     2026-01-02,Dinner,Dining out,60.00,EUR,40.00,-20.00,-20.00
 *     ...
 *     Total balance,,,0.00,EUR,10.00,-5.00,-5.00
 *
 * One column per group member, and the number in it is that member's NET for the row — what they
 * paid minus what they owe — so the member columns sum to zero on every expense row. That is the
 * whole format, and everything below is the arithmetic of turning a net back into "who paid" and
 * "who owes what", which is what Split stores.
 *
 * MONEY. Minor units as BigInt from the first parse to the last. `parseAmountToMinor` (the same
 * function the expense drawer types into) does the decimal work, so a comma-decimal export and a
 * hand-typed amount go through one code path.
 */

import { currencyInfo, parseAmountToMinor, FALLBACK_CURRENCIES } from '@/lib/money'

// ─── shape ──────────────────────────────────────────────────────────────────

/** One expense, ready to be posted. `costMinor` and every share are in `currencyCode`. */
export interface ParsedExpense {
    /** ISO date (YYYY-MM-DD). Splitwise exports one per row; a broken one falls back to today. */
    date: string
    description: string
    category: string | null
    currencyCode: string
    costMinor: string
    /** The member who fronted it, by name. Derived — Splitwise never states it. */
    paidBy: string
    /** Sums to `costMinor` exactly. Zero shares are dropped, so a member absent here owes nothing. */
    shares: ParsedShare[]
}

export interface ParsedShare {
    member: string
    amountMinor: string
}

/** The trailing "Total balance" row, when the export has one. The import's own proof. */
export interface ParsedBalance {
    member: string
    /** Positive = gets money back. Same sign convention as Split's balances. */
    netMinor: string
}

export type WarningCode =
    | 'ROW_UNBALANCED'
    | 'ROW_UNSUPPORTED_CURRENCY'
    | 'ROW_NO_PAYER'
    | 'ROW_ZERO_COST'
    | 'ROW_BAD_AMOUNT'
    | 'ROW_BAD_DATE'
    | 'MULTI_PAYER_SPLIT'
    | 'PAYMENT_ROWS'
    | 'MIXED_CURRENCY'
    | 'DUPLICATE_MEMBER_NAME'

export interface ImportWarning {
    code: WarningCode
    /** 1-based line in the file. Absent on file-level warnings. */
    row?: number
    /** A currency code or a member name, for the message. Never leaves the device. */
    detail?: string
}

export interface SplitwiseImport {
    /** Group members, in header order. Duplicated display names are disambiguated. */
    members: string[]
    expenses: ParsedExpense[]
    /** The currency most rows are in — the honest default for the room. */
    suggestedCurrency: string
    /** Every distinct currency seen, so the UI can be honest about FX before anything is written. */
    currencies: string[]
    /** Null when the export has no "Total balance" row (Splitwise omits it for some exports). */
    totalBalance: ParsedBalance[] | null
    warnings: ImportWarning[]
}

export type ParseErrorCode =
    'NOT_SPLITWISE_CSV' | 'NO_MEMBERS' | 'NO_EXPENSES' | 'TOO_MANY_MEMBERS' | 'TOO_MANY_EXPENSES' | 'FILE_TOO_BIG'

/** A file we cannot turn into a room. Carries a code so the UI can say something true in the
 *  reader's own language instead of rendering an English sentence from a parser. */
export class SplitwiseParseError extends Error {
    constructor(readonly code: ParseErrorCode) {
        super(code)
        this.name = 'SplitwiseParseError'
    }
}

// ─── limits ─────────────────────────────────────────────────────────────────

/** A room is a group chat, not a company ledger. Also the server's cap — the two must agree or
 *  the preview promises something the POST refuses. */
export const MAX_MEMBERS = 20
export const MAX_EXPENSES = 500
/** Bounds the work before any of it is done. 5000 rows is ten years of a busy flatshare. */
export const MAX_ROWS = 5_000
/** Characters, checked before the state machine runs. A Splitwise export of 500 expenses is
 *  ~60 KB; a megabyte of CSV is not one of these files, whatever it is. */
export const MAX_FILE_CHARS = 1_000_000

// ─── RFC 4180 ───────────────────────────────────────────────────────────────

/**
 * Text → rows of raw cells. The whole state machine is `quoted`: inside a quoted field a comma and
 * a newline are data, a doubled quote is one quote, and a single quote ends the field. Outside it,
 * a comma ends the cell and a newline ends the row.
 *
 * A quote only opens a field at its start (`field === ''`). Splitwise never emits `a"b"c`, but a
 * hand-edited file might, and treating a mid-field quote as data keeps the cell readable instead
 * of swallowing the rest of the line.
 */
export function parseCsvRows(input: string): string[][] {
    // A BOM from Excel would otherwise become part of the first header cell, and "﻿Date"
    // matches nothing — the file would look like it isn't a Splitwise export at all.
    const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input

    const rows: string[][] = []
    let row: string[] = []
    let field = ''
    let quoted = false

    for (let i = 0; i < text.length; i++) {
        const ch = text[i]

        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"'
                    i++
                } else {
                    quoted = false
                }
            } else {
                field += ch
            }
            continue
        }

        if (ch === '"' && field === '') quoted = true
        else if (ch === ',') {
            row.push(field)
            field = ''
        } else if (ch === '\n') {
            row.push(field)
            rows.push(row)
            row = []
            field = ''
        } else if (ch !== '\r') field += ch
    }

    row.push(field)
    rows.push(row)
    return rows
}

// ─── header ─────────────────────────────────────────────────────────────────

const normalise = (cell: string) => cell.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Splitwise localises the export header. Only the locales Split itself speaks are listed: a header
 * we do not recognise is not silently guessed at, it becomes a member column, and a "member" named
 * `Coût` is a far louder failure than a missing one.
 */
const COLUMN_ALIASES: Record<string, readonly string[]> = {
    date: ['date', 'fecha', 'data'],
    description: ['description', 'descripción', 'descripcion', 'descrição', 'descricao'],
    category: ['category', 'categoría', 'categoria'],
    cost: ['cost', 'costo', 'coste', 'custo'],
    currency: ['currency', 'moneda', 'moeda'],
}

const BALANCE_ROW_LABELS = ['total balance', 'balance total', 'saldo total', 'saldo']
const PAYMENT_CATEGORIES = ['payment', 'pago', 'pagamento']

interface Header {
    /** Index of each known column, or -1. */
    columns: Record<string, number>
    /** Member display name → column index, in header order. */
    members: { name: string; index: number }[]
    /** Row index the header was found at. */
    at: number
}

const isBlankRow = (row: string[]) => row.every((cell) => cell.trim() === '')

/**
 * Find the header. Splitwise puts it on line 1, but exports that have been through a spreadsheet
 * pick up title rows and blank lines above it, so the search runs down the file rather than
 * insisting on the first line. A row qualifies only if it has Date, Cost AND Currency — any one of
 * those words shows up in ordinary data, and a file without a currency column has no readable
 * amounts anyway, so demanding all three is both the stronger signal and the honest requirement.
 */
function findHeader(rows: string[][]): Header | null {
    for (let at = 0; at < rows.length; at++) {
        const cells = rows[at].map(normalise)
        const columns: Record<string, number> = {}
        for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
            columns[key] = cells.findIndex((cell) => aliases.includes(cell))
        }
        if (columns.date < 0 || columns.cost < 0 || columns.currency < 0) continue

        const known = new Set(Object.values(columns).filter((index) => index >= 0))
        const members = rows[at]
            .map((name, index) => ({ name: name.trim(), index }))
            .filter((column) => !known.has(column.index) && column.name !== '')
        return { columns, members, at }
    }
    return null
}

/** Two people in a group really can both be called Ana. Split refuses duplicate member names, so
 *  disambiguate here rather than letting the POST fail on row 40 of a preview that looked fine. */
function dedupeMemberNames(names: string[], warnings: ImportWarning[]): string[] {
    const seen = new Map<string, number>()
    return names.map((name) => {
        const key = name.toLowerCase()
        const count = (seen.get(key) ?? 0) + 1
        seen.set(key, count)
        if (count === 1) return name
        warnings.push({ code: 'DUPLICATE_MEMBER_NAME', detail: name })
        return `${name} (${count})`
    })
}

// ─── amounts ────────────────────────────────────────────────────────────────

/**
 * A cell → signed minor units, or null if it is not an amount.
 *
 * The sign is peeled off first because `parseAmountToMinor` only accepts non-negative input — it
 * is the expense-drawer parser, and a negative amount is not a thing anyone can type into a form.
 * Everything after the sign (separators, grouping, the ambiguity rules) is its problem, not this
 * file's: one money path, and a comma-decimal CSV behaves exactly like a comma-decimal keystroke.
 */
export function parseSignedMinor(cell: string, decimals: number): bigint | null {
    // An empty member column means "nothing", which is a real zero. Anything else has to read as a
    // number — `n/a` must NOT come back as 0n, or an unreadable file quietly becomes a balanced one.
    if (cell.trim() === '') return 0n

    // Currency symbols and spacing show up in exports that have been through a spreadsheet. JS's
    // `\s` already covers the non-breaking and narrow-no-break spaces those tools like to emit.
    const cleaned = cell.replace(/\s/g, '').replace(/[^\d.,+-]/g, '')
    if (cleaned === '' || cleaned === '-' || cleaned === '+') return null

    const negative = cleaned.startsWith('-')
    const magnitude = parseAmountToMinor(cleaned.replace(/^[+-]/, ''), decimals)
    if (magnitude === null) return null
    const value = BigInt(magnitude)
    return negative ? -value : value
}

const SUPPORTED_CURRENCIES = new Set(FALLBACK_CURRENCIES.map((c) => c.code))

/**
 * Spread `total` across `weights` so the parts are whole minor units and sum to `total` exactly.
 * Floor first, then hand the remainder to the largest fractional parts — the standard
 * largest-remainder apportionment, and the reason a multi-payer row never loses a cent.
 */
export function allocateProportionally(total: bigint, weights: readonly bigint[]): bigint[] {
    const totalWeight = weights.reduce((a, w) => a + w, 0n)
    if (totalWeight <= 0n) return weights.map(() => 0n)

    const parts = weights.map((w) => (total * w) / totalWeight)
    const remainders = weights.map((w, i) => ({ i, rest: total * w - parts[i] * totalWeight }))
    let left = total - parts.reduce((a, p) => a + p, 0n)

    remainders.sort((a, b) => (a.rest === b.rest ? a.i - b.i : a.rest > b.rest ? -1 : 1))
    for (const { i } of remainders) {
        if (left <= 0n) break
        parts[i] += 1n
        left -= 1n
    }
    return parts
}

/**
 * Exact 2D rounding by the northwest-corner rule.
 *
 * Walk the two totals in step from the top-left corner: put as much into the current cell as the
 * smaller of the two remainders allows, subtract it from both, and move on from whichever one
 * emptied. Each cell is a whole number of units, every row sums to its total and every column sums
 * to its total — no rounding pass, no residue to push anywhere, because nothing was ever divided.
 * Requires `Σrows === Σcolumns`, which the caller guarantees by construction.
 *
 * The same walk `suggestedTransfers` does over debtors and creditors, and for the same reason: two
 * pointers over sorted remainders is the shape that cannot leave a cent behind.
 */
export function intersectAllocation(rowTotals: readonly bigint[], columnTotals: readonly bigint[]): bigint[][] {
    const rows = [...rowTotals]
    const columns = [...columnTotals]
    const grid = rows.map(() => columns.map(() => 0n))

    let r = 0
    let c = 0
    while (r < rows.length && c < columns.length) {
        const take = rows[r] < columns[c] ? rows[r] : columns[c]
        grid[r][c] = take
        rows[r] -= take
        columns[c] -= take
        // A zero row total is a real row that owns nothing, so it is stepped over
        // rather than skipped — and when both empty at once the row moves first,
        // which leaves the next column's cell at the zero it already holds.
        if (rows[r] === 0n) r++
        else c++
    }
    return grid
}

// ─── rows ───────────────────────────────────────────────────────────────────

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Splitwise writes YYYY-MM-DD. Anything else gets one attempt through `Date` and then gives up
 *  to today — a wrong date is a cosmetic loss, a dropped expense is a money one. */
function parseDate(cell: string): { date: string; ok: boolean } {
    const raw = cell.trim()
    if (ISO_DATE.test(raw)) return { date: raw, ok: true }
    const parsed = new Date(raw)
    if (raw !== '' && !Number.isNaN(parsed.getTime())) return { date: parsed.toISOString().slice(0, 10), ok: true }
    return { date: new Date().toISOString().slice(0, 10), ok: false }
}

interface RowContext {
    line: number
    warnings: ImportWarning[]
    members: string[]
}

/**
 * One CSV row → zero or more expenses.
 *
 * THE DERIVATION. Splitwise gives `net_i = paid_i − share_i` per member and the row total `cost`,
 * with `Σ net_i = 0`. Split stores `paidBy` and a share per member, so `paid_i` and `share_i` have
 * to be recovered separately.
 *
 * With ONE payer p (the only member whose net is positive), it is forced and exact:
 *
 *     paid_p   = cost                    nobody else put money in
 *     share_p  = cost − net_p            from net_p = cost − share_p
 *     share_i  = −net_i     (i ≠ p)      from net_i = 0 − share_i
 *
 * and the shares reconstruct the total: Σ share = (cost − net_p) + Σ_{i≠p}(−net_i) = cost − Σ net
 * = cost. That identity is why the import cannot drift: it is the same statement as "the row sums
 * to zero", which is checked before any of this runs.
 *
 * With SEVERAL payers, `paid_i` is genuinely unrecoverable — many payment splits produce the same
 * net vector, and Splitwise does not export which one happened. Split has one `paidBy` per
 * expense, so the row becomes one expense per payer, and the choice is made where it can be
 * defended: give payer p a sub-total proportional to their net (`cost_p = cost · net_p / T`, where
 * `T = Σ positive nets`), then take the share vector that single-payer arithmetic would have given
 * (`share_p = cost_p − net_p`, `share_i = −net_i`) and cut it across the sub-expenses by interval
 * overlap. Every sub-expense's shares sum to its own total, every member's shares across the row
 * sum to their true share, so each member's net over the whole row is `paid_i − share_i` — the
 * number Splitwise exported. Per-expense attribution is a reconstruction and the UI says so; the
 * balances are not.
 */
function expensesFromRow(
    values: { date: string; description: string; category: string | null; currencyCode: string; cost: bigint },
    nets: bigint[],
    context: RowContext
): ParsedExpense[] {
    const { line, warnings, members } = context

    if (nets.reduce((a, n) => a + n, 0n) !== 0n) {
        warnings.push({ code: 'ROW_UNBALANCED', row: line, detail: values.description })
        return []
    }

    const payers = nets.map((net, i) => ({ i, net })).filter((entry) => entry.net > 0n)
    if (payers.length === 0) {
        warnings.push({ code: 'ROW_NO_PAYER', row: line, detail: values.description })
        return []
    }

    const subTotals =
        payers.length === 1
            ? [values.cost]
            : allocateProportionally(
                  values.cost,
                  payers.map((p) => p.net)
              )

    // share_i = −net_i for everyone, corrected for the payers by the total they are credited with.
    const shares = nets.map((net) => -net)
    payers.forEach((payer, k) => {
        shares[payer.i] = subTotals[k] - payer.net
    })

    if (shares.some((share) => share < 0n)) {
        // Only reachable when a member "paid" more than the row's own total — the file disagrees
        // with itself, and inventing a reading of it would be inventing money.
        warnings.push({ code: 'ROW_UNBALANCED', row: line, detail: values.description })
        return []
    }

    const owed = shares.map((share, i) => ({ i, share })).filter((entry) => entry.share > 0n)
    const grid = intersectAllocation(
        subTotals,
        owed.map((entry) => entry.share)
    )

    if (payers.length > 1) warnings.push({ code: 'MULTI_PAYER_SPLIT', row: line, detail: values.description })

    return payers
        .map((payer, k) => ({
            date: values.date,
            // A sub-expense that did not say which slice it is would read as a duplicate row.
            description: payers.length === 1 ? values.description : `${values.description} (${k + 1}/${payers.length})`,
            category: values.category,
            currencyCode: values.currencyCode,
            costMinor: subTotals[k].toString(),
            paidBy: members[payer.i],
            shares: owed
                .map((entry, c) => ({ member: members[entry.i], amountMinor: grid[k][c].toString() }))
                .filter((share) => share.amountMinor !== '0'),
        }))
        .filter((expense) => expense.costMinor !== '0')
}

// ─── entry point ────────────────────────────────────────────────────────────

/**
 * Parse a Splitwise group export. Throws `SplitwiseParseError` when there is no room to be made
 * from the file; anything survivable comes back as a warning next to the expenses that did parse,
 * because a group with one unreadable row still wants the other ninety.
 */
export function parseSplitwiseCsv(text: string): SplitwiseImport {
    if (text.length > MAX_FILE_CHARS) throw new SplitwiseParseError('FILE_TOO_BIG')

    const rows = parseCsvRows(text)
    if (rows.length > MAX_ROWS) throw new SplitwiseParseError('FILE_TOO_BIG')

    const header = findHeader(rows)
    if (!header) throw new SplitwiseParseError('NOT_SPLITWISE_CSV')
    if (header.members.length === 0) throw new SplitwiseParseError('NO_MEMBERS')
    if (header.members.length > MAX_MEMBERS) throw new SplitwiseParseError('TOO_MANY_MEMBERS')

    const warnings: ImportWarning[] = []
    const members = dedupeMemberNames(
        header.members.map((column) => column.name),
        warnings
    )
    const memberColumns = header.members.map((column) => column.index)

    const expenses: ParsedExpense[] = []
    const currencyCounts = new Map<string, number>()
    let totalBalance: ParsedBalance[] | null = null
    let sawPaymentRow = false

    const cellAt = (row: string[], index: number) => (index >= 0 ? (row[index] ?? '') : '')

    for (let r = header.at + 1; r < rows.length; r++) {
        const row = rows[r]
        if (isBlankRow(row)) continue
        const line = r + 1

        const currencyCode = cellAt(row, header.columns.currency).trim().toUpperCase()
        const decimals = currencyInfo(currencyCode).decimals
        const dateCell = cellAt(row, header.columns.date)

        // The trailing summary row. It is the import's own check digit, so it is captured rather
        // than skipped — and it is never an expense.
        if (BALANCE_ROW_LABELS.includes(normalise(dateCell))) {
            totalBalance = memberColumns.map((index, m) => ({
                member: members[m],
                netMinor: (parseSignedMinor(cellAt(row, index), decimals) ?? 0n).toString(),
            }))
            continue
        }

        if (!SUPPORTED_CURRENCIES.has(currencyCode)) {
            warnings.push({ code: 'ROW_UNSUPPORTED_CURRENCY', row: line, detail: currencyCode || '—' })
            continue
        }

        const cost = parseSignedMinor(cellAt(row, header.columns.cost), decimals)
        const nets = memberColumns.map((index) => parseSignedMinor(cellAt(row, index), decimals))
        if (cost === null || nets.some((net) => net === null)) {
            warnings.push({ code: 'ROW_BAD_AMOUNT', row: line })
            continue
        }
        if (cost <= 0n) {
            warnings.push({ code: 'ROW_ZERO_COST', row: line })
            continue
        }

        const category = cellAt(row, header.columns.category).trim()
        if (PAYMENT_CATEGORIES.includes(normalise(category))) sawPaymentRow = true

        const { date, ok } = parseDate(dateCell)
        if (!ok) warnings.push({ code: 'ROW_BAD_DATE', row: line })

        // Splitwise allows a blank description; Split does not. The category is the next most
        // useful thing the row knows about itself.
        const description = cellAt(row, header.columns.description).trim() || category || 'Expense'

        const produced = expensesFromRow(
            { date, description, category: category || null, currencyCode, cost },
            nets as bigint[],
            { line, warnings, members }
        )
        if (produced.length > 0) currencyCounts.set(currencyCode, (currencyCounts.get(currencyCode) ?? 0) + 1)
        expenses.push(...produced)
        if (expenses.length > MAX_EXPENSES) throw new SplitwiseParseError('TOO_MANY_EXPENSES')
    }

    if (expenses.length === 0) throw new SplitwiseParseError('NO_EXPENSES')

    // Settle-ups come through as an expense whose whole share sits on whoever was paid. That is
    // balance-identical to a settlement and shows up in the history, but it is not what the row
    // was, so the UI says so rather than letting someone find it later.
    if (sawPaymentRow) warnings.push({ code: 'PAYMENT_ROWS' })

    const currencies = [...currencyCounts.keys()]
    if (currencies.length > 1) warnings.push({ code: 'MIXED_CURRENCY', detail: currencies.join(', ') })

    // Ties go to whichever currency appeared first, which is the top of the file.
    const suggestedCurrency = currencies.reduce(
        (best, code) => ((currencyCounts.get(code) ?? 0) > (currencyCounts.get(best) ?? 0) ? code : best),
        currencies[0]
    )

    return { members, expenses, suggestedCurrency, currencies, totalBalance, warnings }
}

/** "Ski trip 2026 - expenses.csv" → "Ski trip 2026". The filename is the only name the export
 *  carries; Splitwise does not put the group name inside the file. */
export function roomNameFromFilename(filename: string): string {
    const base = filename
        .replace(/\.csv$/i, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    // Splitwise's own export is named "<group>_<date>.csv"; the date tail is noise in a room name.
    const withoutDate = base.replace(/\s*\d{4}[-/ ]\d{2}[-/ ]\d{2}\s*$/, '').trim()
    return (withoutDate || base).slice(0, 80)
}
