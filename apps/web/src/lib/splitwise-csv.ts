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

import { CURRENCY_CATALOG } from '@/lib/currency-catalog'
import { currencyInfo, parseAmountToMinor } from '@/lib/money'

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
    /**
     * How the row divided, as far as the numbers can say.
     *
     * Splitwise exports nets, not intent, so this is a reading rather than a
     * fact — see `isEvenSplit`. It changes nothing about the amounts that get
     * written (the shares below are still what lands, to the cent); it decides
     * which mode the expense OPENS in when somebody edits it later, and whether
     * adding a person to it re-divides or leaves the typed numbers alone. A room
     * where every historic dinner claims to be a hand-typed exact split is a room
     * where the edit drawer is wrong about all of them.
     */
    splitMode: 'EQUAL' | 'EXACT'
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
    | 'ROW_DESCRIPTION_TRUNCATED'
    | 'ROW_CATEGORY_TRUNCATED'
    | 'MEMBER_NAME_TRUNCATED'
    | 'MULTI_PAYER_SPLIT'
    | 'PAYMENT_ROWS'
    | 'MIXED_CURRENCY'
    | 'DUPLICATE_MEMBER_NAME'
    | 'TRUNCATED_HISTORY'
    | 'SPLITPRO_BALANCES_ONLY'
    | 'SPLITPRO_PAIR_HISTORY'
    | 'SPLITPRO_MISSING_NAMES'
    | 'SPLITPRO_BALANCES_SKIPPED'
    | 'SPLITPRO_UNSUPPORTED_CURRENCY'

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
    | 'NOT_SPLITWISE_CSV'
    | 'MALFORMED_JSON'
    | 'SPLITPRO_DIRECT_UNRESOLVED'
    | 'NO_MEMBERS'
    | 'NO_EXPENSES'
    | 'TOO_MANY_MEMBERS'
    | 'TOO_MANY_EXPENSES'
    | 'FILE_TOO_BIG'

/** A file we cannot turn into a room. Carries a code so the UI can say something true in the
 *  reader's own language instead of rendering an English sentence from a parser. */
export class SplitwiseParseError extends Error {
    constructor(readonly code: ParseErrorCode) {
        super(code)
        this.name = 'SplitwiseParseError'
    }
}

// ─── limits ─────────────────────────────────────────────────────────────────

/**
 * The caps, and the reason they live in the PARSER rather than only in the schema: this file is
 * what the preview is built from, and a preview that promises a room the POST would refuse is the
 * worst failure this feature has — the user approves a screen, presses the button, and gets a
 * `VALIDATION_ERROR` with no row number on it. So every ceiling is enforced here, where it can be
 * turned into a warning the user reads BEFORE deciding, and `server/validation.ts` imports these
 * same numbers so the two can never disagree.
 */
/** A room is a group chat, not a company ledger. */
export const MAX_MEMBERS = 20
/** How many expense rows a room may hold. A file with more is not refused any
 *  more — see `capHistory`; the overflow becomes an opening balance. */
export const MAX_EXPENSES = 500
/** Per-field ceilings. Over-long values are truncated with a warning rather than dropped: the
 *  money on the row is the point, and a description cut at 255 characters still says what it was
 *  for. Splitwise itself has no such limits, so real exports do exceed these. */
export const MAX_DESCRIPTION_CHARS = 255
export const MAX_CATEGORY_CHARS = 40
export const MAX_NAME_CHARS = 80
/** Bounds the work before any of it is done. 5000 rows is ten years of a busy flatshare. */
export const MAX_ROWS = 5_000
/**
 * How many expenses may be PARSED, as opposed to written. A multi-payer row
 * becomes one expense per payer, so `MAX_ROWS` alone does not bound this — and
 * everything past `MAX_EXPENSES` still has to be read, because it is what the
 * opening balance is derived from. Beyond this the file is not a group export.
 */
export const MAX_PARSED_EXPENSES = MAX_ROWS
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

/** Cut to fit, without leaving a trailing space where the cut landed. */
const clip = (value: string, max: number): string => (value.length <= max ? value : value.slice(0, max).trimEnd())

/**
 * Bound the member names BEFORE deduping, never after: two ninety-character names that differ only
 * past the eightieth would truncate into the same string, and Split refuses a roster with a
 * repeat — so cutting last would manufacture exactly the duplicate the next step exists to remove.
 */
function boundMemberNames(names: string[], warnings: ImportWarning[]): string[] {
    return names.map((name) => {
        const bounded = clip(name, MAX_NAME_CHARS)
        if (bounded !== name) warnings.push({ code: 'MEMBER_NAME_TRUNCATED', detail: bounded })
        return bounded
    })
}

/** Two people in a group really can both be called Ana. Split refuses duplicate member names, so
 *  disambiguate here rather than letting the POST fail on row 40 of a preview that looked fine. */
function dedupeMemberNames(names: string[], warnings: ImportWarning[]): string[] {
    const used = new Set<string>()
    const nextSuffix = new Map<string, number>()

    return names.map((name) => {
        const key = name.toLowerCase()
        if (!used.has(key)) {
            used.add(key)
            return name
        }

        warnings.push({ code: 'DUPLICATE_MEMBER_NAME', detail: name })
        let count = nextSuffix.get(key) ?? 2
        let candidate: string
        do {
            // Leave room for the suffix so the generated name still passes server validation.
            const suffix = ` (${count})`
            candidate = `${clip(name, MAX_NAME_CHARS - suffix.length)}${suffix}`
            count++
        } while (used.has(candidate.toLowerCase()))

        nextSuffix.set(key, count)
        used.add(candidate.toLowerCase())
        return candidate
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

/**
 * Rated codes only, not the whole catalog. A row in a currency nothing can price is dropped with
 * `ROW_UNSUPPORTED_CURRENCY`, exactly as it has always been — carrying it instead would let one
 * unpriceable row fail the whole import with NO_RATE at write time, which is a much worse answer
 * than losing the row.
 */
const SUPPORTED_CURRENCIES = new Set(CURRENCY_CATALOG.filter((c) => c.hasRate).map((c) => c.code))

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

/**
 * Was this row an even split, or numbers somebody typed?
 *
 * Splitwise exports nets, never intent, so the only evidence is the shape of the
 * shares — and with the sum pinned to the total, "equal to within a minor unit"
 * has exactly one meaning: every share is either `floor(cost/n)` or
 * `ceil(cost/n)`. A three-way split of 100.00 is 33.34/33.33/33.33 and passes; a
 * deliberate 50/30/20 fails on the first share it looks at.
 *
 * Two or more participants required. One share is not a split — it is one person
 * carrying one cost — and calling it EQUAL would only make it possible for a
 * later catch-up to divide somebody's covered ticket across the whole room.
 *
 * The reading is deliberately conservative in one direction: a row this calls
 * EXACT that was really an even split costs nothing but a slightly wrong edit
 * drawer, while a row this calls EQUAL that was really deliberate is a set of
 * chosen numbers waiting to be overwritten.
 */
export function isEvenSplit(costMinor: bigint, shares: readonly bigint[]): boolean {
    if (shares.length < 2) return false
    const n = BigInt(shares.length)
    const floor = costMinor / n
    const ceiling = costMinor % n === 0n ? floor : floor + 1n
    return shares.every((share) => share === floor || share === ceiling)
}

// ─── rows ───────────────────────────────────────────────────────────────────

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Splitwise writes YYYY-MM-DD. Anything else gets one attempt through `Date` and then gives up
 *  to today — a wrong date is a cosmetic loss, a dropped expense is a money one. */
function parseDate(cell: string): { date: string; ok: boolean } {
    const raw = cell.trim()
    if (ISO_DATE.test(raw)) {
        const parsed = new Date(`${raw}T00:00:00.000Z`)
        if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw) {
            return { date: raw, ok: true }
        }
    }

    const parsed = new Date(raw)
    if (raw !== '' && !ISO_DATE.test(raw) && !Number.isNaN(parsed.getTime())) {
        return { date: parsed.toISOString().slice(0, 10), ok: true }
    }

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

    // The suffix is part of the description the POST will see, so the base is cut to leave room
    // for it — a legal 253-character description on a two-payer row would otherwise become 259
    // and take the whole import down with a message naming no row. Widest form of the suffix, so
    // the ceiling holds for the tenth slice as well as the first.
    const suffixWidth = payers.length === 1 ? 0 : ` (${payers.length}/${payers.length})`.length
    const description = clip(values.description, MAX_DESCRIPTION_CHARS - suffixWidth)
    if (description !== values.description) warnings.push({ code: 'ROW_DESCRIPTION_TRUNCATED', row: line })

    return payers
        .map((payer, k) => {
            const rowShares = owed
                .map((entry, c) => ({ member: members[entry.i], amountMinor: grid[k][c].toString() }))
                .filter((share) => share.amountMinor !== '0')
            return {
                date: values.date,
                // A sub-expense that did not say which slice it is would read as a duplicate row.
                description: payers.length === 1 ? description : `${description} (${k + 1}/${payers.length})`,
                category: values.category,
                currencyCode: values.currencyCode,
                costMinor: subTotals[k].toString(),
                paidBy: members[payer.i],
                splitMode: isEvenSplit(
                    subTotals[k],
                    rowShares.map((share) => BigInt(share.amountMinor))
                )
                    ? ('EQUAL' as const)
                    : ('EXACT' as const),
                shares: rowShares,
            }
        })
        .filter((expense) => expense.costMinor !== '0')
}

// ─── the history cap ────────────────────────────────────────────────────────

/**
 * A room holds five hundred expenses. A four-year flatshare exports two thousand,
 * and the old answer was "start a fresh room" — which is the same sentence as
 * "your history is not welcome here", said to the person with the most history.
 *
 * So the overflow is carried instead of refused: keep the most recent
 * `MAX_EXPENSES`-worth, and turn everything older into an OPENING BALANCE that
 * reproduces its effect exactly.
 *
 * WHAT THE OPENING BALANCE IS MADE OF, and why it is this and not something else.
 * The residual is derived from the DROPPED ROWS THEMSELVES, not from the file's
 * "Total balance" summary minus the kept subset. Both give the same answer when
 * the file reconciles, and when it does not, this one is still exactly right:
 * the difference is then the unreadable rows, which already have their own
 * warnings and must not be silently papered over by an opening balance that
 * invents money to make a total match.
 *
 * The SHAPE is a settlement-style entry expressed as an expense, because an
 * expense is the only thing an import can write:
 *
 *     debtor D owes creditor C the amount A
 *       →  one expense, cost A, paid by C, with a single share of A on D
 *
 * whose effect on balances is `+A` to C and `−A` to D — which is the transfer,
 * exactly. The pairing is the same greedy debtor-against-creditor walk
 * `suggestedTransfers` does, so at most `n − 1` rows per currency, and every
 * member's net over the opening balance equals their net over the dropped rows
 * to the cent. Per currency, because a residual in one currency cannot be netted
 * against another without inventing a rate nobody agreed to.
 *
 * HOW FAR "TO THE CENT" REACHES. Exactly that far and no further: it is a claim
 * about the EXPENSE currency, which is the only currency this file works in.
 * A room whose own currency differs converts on the way in (`buildExpense`), and
 * conversion rounds — so the carried rows and the rows they stand for do not
 * have to land on the same room-currency integer. They cannot: the fold rounds
 * ONCE per carried row where the history rounded once per dropped row, which is
 * the honest direction of the trade (fewer roundings, not more) but is still a
 * different number. The residue is bounded by the pairing rather than by the
 * length of the history — at most `n − 1` carried rows exist, each contributing
 * under half a minor unit, so no member is off by more than the roster size
 * however many thousand rows were folded away. And every carried row moves ONE
 * integer from a debtor to a creditor, so whatever the rounding did, the room
 * still sums to zero. `splitwise-csv.test.ts` pins both halves.
 *
 * They are EXACT, deliberately: a single-share row is not a division of anything,
 * and marking it EQUAL would let a later catch-up spread somebody's carried-over
 * debt across the room.
 */
export function capHistory(
    expenses: readonly ParsedExpense[],
    warnings: ImportWarning[]
): { expenses: ParsedExpense[]; dropped: number } {
    if (expenses.length <= MAX_EXPENSES) return { expenses: [...expenses], dropped: 0 }

    const members = [...new Set(expenses.flatMap((e) => [e.paidBy, ...e.shares.map((s) => s.member)]))]
    const currencies = [...new Set(expenses.map((e) => e.currencyCode))]
    // The opening balance has to fit inside the ceiling alongside the history it
    // is standing in for, so its worst case is reserved before the cut rather
    // than discovered after it. The worst case is `MAX_MEMBERS − 1` rows per currency, over the
    // currencies THIS FILE uses — not over the catalog, which is 162 codes wide and would reserve
    // more than the ceiling. A twelve-currency file reserves 19 × 12 = 228 of the 500.
    const reserved = Math.max(0, members.length - 1) * Math.max(1, currencies.length)
    const cut = Math.max(1, MAX_EXPENSES - reserved)

    // Newest first, with the original file order as the tie-break so two rows on
    // the same day cannot swap places between runs.
    const ordered = expenses
        .map((expense, index) => ({ expense, index }))
        .sort((a, b) =>
            a.expense.date === b.expense.date ? a.index - b.index : a.expense.date < b.expense.date ? 1 : -1
        )

    const kept = ordered.slice(0, cut).map((entry) => entry.expense)
    const dropped = ordered.slice(cut).map((entry) => entry.expense)
    warnings.push({ code: 'TRUNCATED_HISTORY', detail: String(dropped.length) })

    return { expenses: [...openingBalance(dropped), ...kept], dropped: dropped.length }
}

/** The dropped rows, folded into at most one transfer-shaped expense per pair per
 *  currency. Exported for tests; pure. */
export function openingBalance(dropped: readonly ParsedExpense[]): ParsedExpense[] {
    const out: ParsedExpense[] = []

    for (const currencyCode of [...new Set(dropped.map((expense) => expense.currencyCode))]) {
        const rows = dropped.filter((expense) => expense.currencyCode === currencyCode)
        const net = new Map<string, bigint>()
        const bump = (member: string, delta: bigint) => net.set(member, (net.get(member) ?? 0n) + delta)
        for (const expense of rows) {
            bump(expense.paidBy, BigInt(expense.costMinor))
            for (const share of expense.shares) bump(share.member, -BigInt(share.amountMinor))
        }

        // Sorted by size then name so the pairing — and therefore the rows, and
        // therefore the preview — is the same on every run of the same file.
        const byWeight = (a: { member: string; amount: bigint }, b: { member: string; amount: bigint }) =>
            a.amount === b.amount ? a.member.localeCompare(b.member) : a.amount > b.amount ? -1 : 1
        const entries = [...net.entries()].map(([member, amount]) => ({ member, amount }))
        const debtors = entries
            .filter((e) => e.amount < 0n)
            .map((e) => ({ ...e, amount: -e.amount }))
            .sort(byWeight)
        const creditors = entries.filter((e) => e.amount > 0n).sort(byWeight)

        // The newest of the rows being folded away: the opening balance is true as
        // of the last thing it swallowed, and sits at the start of the history.
        const date = rows.reduce((latest, expense) => (expense.date > latest ? expense.date : latest), rows[0].date)

        let i = 0
        let j = 0
        while (i < debtors.length && j < creditors.length) {
            const pay = debtors[i].amount < creditors[j].amount ? debtors[i].amount : creditors[j].amount
            if (pay > 0n) {
                out.push({
                    date,
                    description: clip(
                        `${BROUGHT_FORWARD} — ${debtors[i].member} → ${creditors[j].member}`,
                        MAX_DESCRIPTION_CHARS
                    ),
                    category: null,
                    currencyCode,
                    costMinor: pay.toString(),
                    paidBy: creditors[j].member,
                    splitMode: 'EXACT',
                    shares: [{ member: debtors[i].member, amountMinor: pay.toString() }],
                })
            }
            debtors[i].amount -= pay
            creditors[j].amount -= pay
            if (debtors[i].amount === 0n) i++
            if (creditors[j].amount === 0n) j++
        }
    }

    return out
}

/** Stored data rather than UI copy, so it is written here in English for the same
 *  reason the blank-description fallback above is. */
export const BROUGHT_FORWARD = 'Balance brought forward'

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
        boundMemberNames(
            header.members.map((column) => column.name),
            warnings
        ),
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

        const rawCategory = cellAt(row, header.columns.category).trim()
        // Matched before the cut: a payment category is one short word, and testing the truncated
        // form would be testing something the file never said.
        if (PAYMENT_CATEGORIES.includes(normalise(rawCategory))) sawPaymentRow = true
        const category = clip(rawCategory, MAX_CATEGORY_CHARS)
        if (category !== rawCategory) warnings.push({ code: 'ROW_CATEGORY_TRUNCATED', row: line })

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
        // The ceiling that stands between us and an unbounded parse, NOT the
        // ceiling on what a room holds — that one is carried rather than refused,
        // in `capHistory` below.
        if (expenses.length > MAX_PARSED_EXPENSES) throw new SplitwiseParseError('TOO_MANY_EXPENSES')
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

    // Last, and after the currency tally: what gets carried is decided over the
    // whole file, and an opening balance must not be counted as evidence for
    // which currency the room should settle in.
    const capped = capHistory(expenses, warnings)

    return { members, expenses: capped.expenses, suggestedCurrency, currencies, totalBalance, warnings }
}

/** One member whose imported net does not match what the file's own summary row claims. */
export interface BalanceDrift {
    member: string
    /** Ours minus theirs, in minor units. Non-zero by construction. */
    deltaMinor: string
}

/**
 * The import's free end-to-end proof, finally spent.
 *
 * Splitwise appends a "Total balance" row: its own arithmetic over the same file. Folding the
 * expenses we are about to write and comparing gives an exact answer to the only question that
 * matters here — will this room show the same numbers the group is used to? — for the price of one
 * loop, before anything is written.
 *
 * Null when the question is not meaningful: no summary row, or more than one currency (the row is
 * per-currency and Splitwise never reconciles them, so a mismatch would say nothing).
 * Empty array means every member matched to the cent.
 */
export function reconcileTotalBalance(result: SplitwiseImport): BalanceDrift[] | null {
    if (!result.totalBalance || result.currencies.length !== 1) return null

    const net = new Map<string, bigint>(result.members.map((member) => [member, 0n]))
    const bump = (member: string, delta: bigint) => net.set(member, (net.get(member) ?? 0n) + delta)
    for (const expense of result.expenses) {
        bump(expense.paidBy, BigInt(expense.costMinor))
        for (const share of expense.shares) bump(share.member, -BigInt(share.amountMinor))
    }

    const drift: BalanceDrift[] = []
    for (const stated of result.totalBalance) {
        const ours = net.get(stated.member) ?? 0n
        const delta = ours - BigInt(stated.netMinor)
        if (delta !== 0n) drift.push({ member: stated.member, deltaMinor: delta.toString() })
    }
    return drift
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
