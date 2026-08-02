/**
 * Split Pro export -> the same browser-side import shape used by Splitwise.
 *
 * Split Pro currently has two unrelated exports:
 *
 * - Account -> "Download SplitPro data" produces `splitpro_data.json`. Despite
 *   its name, that file contains group rosters and current pairwise balances,
 *   not expense history. Each balance therefore becomes a balance-brought-
 *   forward expense. That is the only truthful reconstruction the file allows.
 * - A friend's balance page -> "Export" produces a CSV containing the expense
 *   history between those two people. It omits the group an expense belonged
 *   to, so all of those rows necessarily arrive in one room.
 *
 * This module is dependency-free and runs only on the uploaded text. The source
 * file never leaves the browser.
 */

import { currencyInfo, FALLBACK_CURRENCIES } from '@/lib/money'
import {
    BROUGHT_FORWARD,
    MAX_CATEGORY_CHARS,
    MAX_DESCRIPTION_CHARS,
    MAX_FILE_CHARS,
    MAX_MEMBERS,
    MAX_NAME_CHARS,
    MAX_PARSED_EXPENSES,
    MAX_ROWS,
    SplitwiseParseError,
    capHistory,
    isEvenSplit,
    parseCsvRows,
    parseSignedMinor,
    parseSplitwiseCsv,
    roomNameFromFilename,
    type ImportWarning,
    type ParseErrorCode,
    type ParsedExpense,
    type SplitwiseImport,
} from '@/lib/splitwise-csv'

const SUPPORTED_CURRENCIES = new Set(FALLBACK_CURRENCIES.map((currency) => currency.code))
const MAX_SIGNED_MINOR = 9_223_372_036_854_775_807n

export type ImportSource = 'splitwise' | 'splitpro'

export interface ImportChoice {
    id: string
    roomName: string
    parsed: SplitwiseImport
}

export interface SkippedImportChoice {
    roomName: string
    reason: ParseErrorCode
}

export interface ParsedImportFile {
    source: ImportSource
    choices: ImportChoice[]
    /** Split Pro account backups can contain both usable and unusable groups. */
    skipped: SkippedImportChoice[]
}

const record = (value: unknown): Record<string, unknown> | null =>
    typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const integer = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value
    if (typeof value === 'string' && /^-?\d+$/.test(value)) {
        const parsed = Number(value)
        return Number.isSafeInteger(parsed) ? parsed : null
    }
    return null
}

const minor = (value: unknown): bigint | null => {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return null
    const raw = String(value)
    if (!/^-?\d+$/.test(raw)) return null
    try {
        const parsed = BigInt(raw)
        return parsed >= -MAX_SIGNED_MINOR && parsed <= MAX_SIGNED_MINOR ? parsed : null
    } catch {
        return null
    }
}

const clip = (value: string, max: number): string => (value.length <= max ? value : value.slice(0, max).trimEnd())

/** Bound and disambiguate names before they become the join keys in expenses. */
function safeNames(rawNames: string[], warnings: ImportWarning[]): string[] {
    const used = new Set<string>()

    return rawNames.map((rawName) => {
        let name = clip(rawName.trim(), MAX_NAME_CHARS)
        if (name !== rawName.trim()) warnings.push({ code: 'MEMBER_NAME_TRUNCATED', detail: name })

        const original = name
        let suffix = 2
        while (used.has(name.toLowerCase())) {
            const tail = ` (${suffix})`
            name = `${clip(original, MAX_NAME_CHARS - tail.length)}${tail}`
            suffix++
        }
        if (name !== original) warnings.push({ code: 'DUPLICATE_MEMBER_NAME', detail: original })
        used.add(name.toLowerCase())
        return name
    })
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function importDate(value: unknown): { date: string; ok: boolean } {
    const raw = text(value)
    if (ISO_DATE.test(raw)) {
        const parsed = new Date(`${raw}T00:00:00.000Z`)
        if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw) {
            return { date: raw, ok: true }
        }
    }

    const parsed = new Date(raw)
    if (raw && !Number.isNaN(parsed.getTime())) return { date: parsed.toISOString().slice(0, 10), ok: true }
    return { date: new Date().toISOString().slice(0, 10), ok: false }
}

function finishImport(
    members: string[],
    expenses: ParsedExpense[],
    warnings: ImportWarning[],
    preferredCurrency?: string
): SplitwiseImport {
    if (members.length === 0) throw new SplitwiseParseError('NO_MEMBERS')
    if (members.length > MAX_MEMBERS) throw new SplitwiseParseError('TOO_MANY_MEMBERS')
    if (expenses.length === 0) throw new SplitwiseParseError('NO_EXPENSES')
    if (expenses.length > MAX_PARSED_EXPENSES) throw new SplitwiseParseError('TOO_MANY_EXPENSES')

    const currencyCounts = new Map<string, number>()
    for (const expense of expenses) {
        currencyCounts.set(expense.currencyCode, (currencyCounts.get(expense.currencyCode) ?? 0) + 1)
    }
    const currencies = [...currencyCounts.keys()]
    if (currencies.length > 1) warnings.push({ code: 'MIXED_CURRENCY', detail: currencies.join(', ') })

    const frequentCurrency = currencies.reduce(
        (best, code) => ((currencyCounts.get(code) ?? 0) > (currencyCounts.get(best) ?? 0) ? code : best),
        currencies[0]
    )
    const suggestedCurrency =
        preferredCurrency && SUPPORTED_CURRENCIES.has(preferredCurrency) ? preferredCurrency : frequentCurrency
    const capped = capHistory(expenses, warnings)

    return {
        members,
        expenses: capped.expenses,
        suggestedCurrency,
        currencies,
        totalBalance: null,
        warnings,
    }
}

// ─── Split Pro friend CSV ──────────────────────────────────────────────────

const SPLITPRO_CSV_HEADERS = [
    'paid by',
    'name',
    'category',
    'amount',
    'split type',
    'expense date',
    'currency',
    'you lent',
    'you owe',
    'settlement',
] as const

const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

function splitProCsvHeader(rows: string[][]): Map<string, number> | null {
    const cells = rows[0]?.map(normalise) ?? []
    if (!SPLITPRO_CSV_HEADERS.every((header) => cells.includes(header))) return null
    return new Map(SPLITPRO_CSV_HEADERS.map((header) => [header, cells.indexOf(header)]))
}

function friendNameFromFilename(filename: string): string {
    const base = filename.replace(/\.csv$/i, '')
    const match = base.match(/^expenses[_\s-]+with[_\s-]+(.+)$/i)
    return (match?.[1] ?? 'Friend').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Friend'
}

function parseSplitProCsv(filename: string, rows: string[][]): SplitwiseImport {
    if (rows.length > MAX_ROWS) throw new SplitwiseParseError('FILE_TOO_BIG')
    const header = splitProCsvHeader(rows)
    if (!header) throw new SplitwiseParseError('NOT_SPLITWISE_CSV')

    const warnings: ImportWarning[] = [{ code: 'SPLITPRO_PAIR_HISTORY' }]
    const members = safeNames(['You', friendNameFromFilename(filename)], warnings)
    const [you, friend] = members
    const expenses: ParsedExpense[] = []
    let sawSettlement = false

    const cell = (row: string[], column: string) => row[header.get(column) ?? -1] ?? ''

    for (let index = 1; index < rows.length; index++) {
        const row = rows[index]
        if (row.every((value) => value.trim() === '')) continue
        const line = index + 1
        const currencyCode = cell(row, 'currency').trim().toUpperCase()
        if (!SUPPORTED_CURRENCIES.has(currencyCode)) {
            warnings.push({ code: 'ROW_UNSUPPORTED_CURRENCY', row: line, detail: currencyCode || '—' })
            continue
        }

        const decimals = currencyInfo(currencyCode).decimals
        const cost = parseSignedMinor(cell(row, 'amount'), decimals)
        const lent = parseSignedMinor(cell(row, 'you lent'), decimals)
        const owed = parseSignedMinor(cell(row, 'you owe'), decimals)
        const settlement = parseSignedMinor(cell(row, 'settlement'), decimals)
        if ([cost, lent, owed, settlement].some((value) => value === null)) {
            warnings.push({ code: 'ROW_BAD_AMOUNT', row: line })
            continue
        }
        if (cost! <= 0n) {
            warnings.push({ code: 'ROW_ZERO_COST', row: line })
            continue
        }

        const payer = normalise(cell(row, 'paid by')) === 'you' ? you : friend
        const receiver = payer === you ? friend : you
        const isSettlement = normalise(cell(row, 'split type')) === 'settlement' || settlement! > 0n
        let shares: { member: string; amountMinor: string }[]

        if (isSettlement) {
            sawSettlement = true
            shares = [{ member: receiver, amountMinor: cost!.toString() }]
        } else {
            const otherShare = payer === you ? lent! : owed!
            if (otherShare < 0n || otherShare > cost!) {
                warnings.push({ code: 'ROW_UNBALANCED', row: line })
                continue
            }
            const payerShare = cost! - otherShare
            shares = [
                { member: payer, amountMinor: payerShare.toString() },
                { member: receiver, amountMinor: otherShare.toString() },
            ].filter((share) => share.amountMinor !== '0')
        }

        const rawCategory = cell(row, 'category').trim()
        const category = clip(rawCategory, MAX_CATEGORY_CHARS)
        if (category !== rawCategory) warnings.push({ code: 'ROW_CATEGORY_TRUNCATED', row: line })

        const rawDescription = cell(row, 'name').trim() || (isSettlement ? 'Settle up' : category || 'Expense')
        const description = clip(rawDescription, MAX_DESCRIPTION_CHARS)
        if (description !== rawDescription) warnings.push({ code: 'ROW_DESCRIPTION_TRUNCATED', row: line })

        const parsedDate = importDate(cell(row, 'expense date'))
        if (!parsedDate.ok) warnings.push({ code: 'ROW_BAD_DATE', row: line })

        expenses.push({
            date: parsedDate.date,
            description,
            category: category || null,
            currencyCode,
            costMinor: cost!.toString(),
            paidBy: payer,
            splitMode: isEvenSplit(
                cost!,
                shares.map((share) => BigInt(share.amountMinor))
            )
                ? 'EQUAL'
                : 'EXACT',
            shares,
        })
    }

    if (sawSettlement) warnings.push({ code: 'PAYMENT_ROWS' })
    return finishImport(members, expenses, warnings)
}

// ─── Split Pro account JSON ────────────────────────────────────────────────

interface SplitProFriend {
    id: number
    name: string
    balances: { currency: string; amount: bigint }[]
}

function splitProFriends(value: unknown): Map<number, SplitProFriend> {
    const source = record(value)
    const friends = new Map<number, SplitProFriend>()
    if (!source) return friends

    for (const rawFriend of Object.values(source)) {
        const friend = record(rawFriend)
        const id = integer(friend?.id)
        if (!friend || id === null) continue
        const fallback = text(friend.email).split('@')[0]
        const balances = Array.isArray(friend.balances)
            ? friend.balances.flatMap((rawBalance) => {
                  const balance = record(rawBalance)
                  const amount = minor(balance?.amount)
                  const currency = text(balance?.currency).toUpperCase()
                  return amount === null || !currency ? [] : [{ currency, amount }]
              })
            : []
        friends.set(id, { id, name: text(friend.name) || fallback || `Member ${id}`, balances })
    }
    return friends
}

function inferCurrentUserId(groups: Record<string, unknown>[], friends: Map<number, SplitProFriend>): number | null {
    const memberships = groups
        .map((group) =>
            Array.isArray(group.groupUsers)
                ? new Set(
                      group.groupUsers
                          .map((rawMember) => integer(record(rawMember)?.userId))
                          .filter((id): id is number => id !== null)
                  )
                : new Set<number>()
        )
        .filter((ids) => ids.size > 0)
    if (memberships.length === 0) return null

    const common = [...memberships[0]].filter((id) => memberships.every((membership) => membership.has(id)))
    const candidates = common.filter((id) => !friends.has(id))
    return candidates.length === 1 ? candidates[0] : null
}

function parseSplitProGroup(
    group: Record<string, unknown>,
    groupIndex: number,
    friends: Map<number, SplitProFriend>,
    currentUserId: number | null
): ImportChoice {
    const warnings: ImportWarning[] = [{ code: 'SPLITPRO_BALANCES_ONLY' }]
    const rawBalances = Array.isArray(group.groupBalances) ? group.groupBalances : []
    const memberIds = new Set<number>()

    if (Array.isArray(group.groupUsers)) {
        for (const rawMember of group.groupUsers) {
            const id = integer(record(rawMember)?.userId)
            if (id !== null) memberIds.add(id)
        }
    }
    for (const rawBalance of rawBalances) {
        const balance = record(rawBalance)
        const userId = integer(balance?.userId)
        const friendId = integer(balance?.friendId)
        if (userId !== null) memberIds.add(userId)
        if (friendId !== null) memberIds.add(friendId)
    }

    if (memberIds.size === 0) throw new SplitwiseParseError('NO_MEMBERS')
    if (memberIds.size > MAX_MEMBERS) throw new SplitwiseParseError('TOO_MANY_MEMBERS')

    const missingNames = [...memberIds].filter((id) => id !== currentUserId && !friends.has(id)).length
    if (missingNames > 0) warnings.push({ code: 'SPLITPRO_MISSING_NAMES', detail: String(missingNames) })

    const orderedIds = [...memberIds].sort((a, b) => {
        if (a === currentUserId) return -1
        if (b === currentUserId) return 1
        return a - b
    })
    const members = safeNames(
        orderedIds.map((id) => (id === currentUserId ? 'You' : (friends.get(id)?.name ?? `Member ${id}`))),
        warnings
    )
    const nameFor = new Map(orderedIds.map((id, index) => [id, members[index]]))

    const expenses: ParsedExpense[] = []
    const seen = new Map<string, bigint>()
    const unsupportedCurrencies = new Set<string>()
    let skipped = 0

    for (const rawBalance of rawBalances) {
        const balance = record(rawBalance)
        const userId = integer(balance?.userId)
        const friendId = integer(balance?.friendId)
        const amount = minor(balance?.amount)
        const currencyCode = text(balance?.currency).toUpperCase()
        if (userId === null || friendId === null || amount === null || userId === friendId) {
            skipped++
            continue
        }
        if (!SUPPORTED_CURRENCIES.has(currencyCode)) {
            unsupportedCurrencies.add(currencyCode || '—')
            continue
        }
        if (amount === 0n) continue

        const low = Math.min(userId, friendId)
        const high = Math.max(userId, friendId)
        const key = `${low}:${high}:${currencyCode}`
        const canonical = userId === low ? amount : -amount
        const previous = seen.get(key)
        if (previous !== undefined) {
            if (previous !== canonical) skipped++
            continue
        }
        seen.set(key, canonical)

        const creditorId = amount > 0n ? userId : friendId
        const debtorId = amount > 0n ? friendId : userId
        const creditor = nameFor.get(creditorId)
        const debtor = nameFor.get(debtorId)
        if (!creditor || !debtor) {
            skipped++
            continue
        }
        const value = amount < 0n ? -amount : amount
        const parsedDate = importDate(balance?.updatedAt ?? group.updatedAt)
        expenses.push({
            date: parsedDate.date,
            description: clip(`${BROUGHT_FORWARD} — ${debtor} → ${creditor}`, MAX_DESCRIPTION_CHARS),
            category: null,
            currencyCode,
            costMinor: value.toString(),
            paidBy: creditor,
            splitMode: 'EXACT',
            shares: [{ member: debtor, amountMinor: value.toString() }],
        })
    }

    if (skipped > 0) warnings.push({ code: 'SPLITPRO_BALANCES_SKIPPED', detail: String(skipped) })
    if (unsupportedCurrencies.size > 0) {
        warnings.push({ code: 'SPLITPRO_UNSUPPORTED_CURRENCY', detail: [...unsupportedCurrencies].join(', ') })
    }

    const roomName = clip(text(group.name) || `SplitPro group ${groupIndex + 1}`, 80)
    return {
        id: String(integer(group.id) ?? integer(group.publicId) ?? groupIndex),
        roomName,
        parsed: finishImport(members, expenses, warnings, text(group.defaultCurrency).toUpperCase()),
    }
}

function parseDirectBalances(friends: Map<number, SplitProFriend>): ImportChoice {
    const warnings: ImportWarning[] = [{ code: 'SPLITPRO_BALANCES_ONLY' }]
    const friendList = [...friends.values()].filter((friend) =>
        friend.balances.some((balance) => balance.amount !== 0n)
    )
    if (friendList.length + 1 > MAX_MEMBERS) throw new SplitwiseParseError('TOO_MANY_MEMBERS')
    const members = safeNames(['You', ...friendList.map((friend) => friend.name)], warnings)
    const [you, ...friendNames] = members
    const expenses: ParsedExpense[] = []
    const unsupportedCurrencies = new Set<string>()

    friendList.forEach((friend, index) => {
        const other = friendNames[index]
        const totals = new Map<string, bigint>()
        for (const balance of friend.balances) {
            totals.set(balance.currency, (totals.get(balance.currency) ?? 0n) + balance.amount)
        }
        for (const [currencyCode, amount] of totals) {
            if (!SUPPORTED_CURRENCIES.has(currencyCode)) {
                unsupportedCurrencies.add(currencyCode || '—')
                continue
            }
            if (amount === 0n) continue
            const creditor = amount > 0n ? you : other
            const debtor = amount > 0n ? other : you
            const value = amount < 0n ? -amount : amount
            expenses.push({
                date: new Date().toISOString().slice(0, 10),
                description: clip(`${BROUGHT_FORWARD} — ${debtor} → ${creditor}`, MAX_DESCRIPTION_CHARS),
                category: null,
                currencyCode,
                costMinor: value.toString(),
                paidBy: creditor,
                splitMode: 'EXACT',
                shares: [{ member: debtor, amountMinor: value.toString() }],
            })
        }
    })

    if (unsupportedCurrencies.size > 0) {
        warnings.push({ code: 'SPLITPRO_UNSUPPORTED_CURRENCY', detail: [...unsupportedCurrencies].join(', ') })
    }
    return {
        id: 'direct-balances',
        roomName: 'SplitPro balances',
        parsed: finishImport(members, expenses, warnings),
    }
}

/**
 * The friend list contains balances from every group plus balances that are not
 * in a group, but drops `groupId`. Subtract the group rows from that account-wide
 * total to recover the latter without importing any balance twice.
 */
function balancesOutsideGroups(
    friends: Map<number, SplitProFriend>,
    groups: Record<string, unknown>[],
    currentUserId: number
): Map<number, SplitProFriend> {
    const totals = new Map<number, Map<string, bigint>>()
    for (const friend of friends.values()) {
        const byCurrency = new Map<string, bigint>()
        for (const balance of friend.balances) {
            byCurrency.set(balance.currency, (byCurrency.get(balance.currency) ?? 0n) + balance.amount)
        }
        totals.set(friend.id, byCurrency)
    }

    for (const group of groups) {
        if (!Array.isArray(group.groupBalances)) continue
        for (const rawBalance of group.groupBalances) {
            const balance = record(rawBalance)
            const userId = integer(balance?.userId)
            const friendId = integer(balance?.friendId)
            const amount = minor(balance?.amount)
            const currency = text(balance?.currency).toUpperCase()
            if (userId !== currentUserId || friendId === null || amount === null || !currency) continue
            const byCurrency = totals.get(friendId)
            if (byCurrency) byCurrency.set(currency, (byCurrency.get(currency) ?? 0n) - amount)
        }
    }

    const residual = new Map<number, SplitProFriend>()
    for (const friend of friends.values()) {
        const balances = [...(totals.get(friend.id) ?? [])]
            .filter(([, amount]) => amount !== 0n)
            .map(([currency, amount]) => ({ currency, amount }))
        if (balances.length > 0) residual.set(friend.id, { ...friend, balances })
    }
    return residual
}

function parseSplitProJson(textValue: string): ParsedImportFile {
    let decoded: unknown
    try {
        decoded = JSON.parse(textValue)
    } catch {
        throw new SplitwiseParseError('MALFORMED_JSON')
    }

    const root = record(decoded)
    if (!root || !('groups' in root) || !('friends' in root)) {
        throw new SplitwiseParseError('NOT_SPLITWISE_CSV')
    }
    const rawGroups = Array.isArray(root.groups)
        ? root.groups.map(record).filter((group): group is Record<string, unknown> => !!group)
        : []
    const friends = splitProFriends(root.friends)

    if (rawGroups.length === 0) {
        return { source: 'splitpro', choices: [parseDirectBalances(friends)], skipped: [] }
    }

    const currentUserId = inferCurrentUserId(rawGroups, friends)
    const choices: ImportChoice[] = []
    const skipped: SkippedImportChoice[] = []

    rawGroups.forEach((group, index) => {
        const roomName = clip(text(group.name) || `SplitPro group ${index + 1}`, 80)
        try {
            choices.push(parseSplitProGroup(group, index, friends, currentUserId))
        } catch (error) {
            if (error instanceof SplitwiseParseError) skipped.push({ roomName, reason: error.code })
            else throw error
        }
    })

    const friendsWithBalances = [...friends.values()].some((friend) =>
        friend.balances.some((balance) => balance.amount !== 0n)
    )
    if (friendsWithBalances && currentUserId === null) {
        skipped.push({ roomName: 'Balances outside groups', reason: 'SPLITPRO_DIRECT_UNRESOLVED' })
    } else if (currentUserId !== null) {
        const direct = balancesOutsideGroups(friends, rawGroups, currentUserId)
        if (direct.size > 0) {
            try {
                choices.push(parseDirectBalances(direct))
            } catch (error) {
                if (error instanceof SplitwiseParseError) {
                    skipped.push({ roomName: 'Balances outside groups', reason: error.code })
                } else throw error
            }
        }
    }

    if (choices.length === 0) {
        const reason = skipped.some((choice) => choice.reason === 'TOO_MANY_MEMBERS')
            ? 'TOO_MANY_MEMBERS'
            : 'NO_EXPENSES'
        throw new SplitwiseParseError(reason)
    }
    return { source: 'splitpro', choices, skipped }
}

/** Detect and parse every upload format the importer promises. */
export function parseImportFile(textValue: string, filename: string): ParsedImportFile {
    if (textValue.length > MAX_FILE_CHARS) throw new SplitwiseParseError('FILE_TOO_BIG')
    const trimmed = textValue.trimStart()
    if (/\.json$/i.test(filename) || trimmed.startsWith('{')) return parseSplitProJson(textValue)

    const rows = parseCsvRows(textValue)
    if (splitProCsvHeader(rows)) {
        return {
            source: 'splitpro',
            choices: [
                {
                    id: 'splitpro-friend-csv',
                    roomName: roomNameFromFilename(filename),
                    parsed: parseSplitProCsv(filename, rows),
                },
            ],
            skipped: [],
        }
    }

    return {
        source: 'splitwise',
        choices: [
            {
                id: 'splitwise-csv',
                roomName: roomNameFromFilename(filename),
                parsed: parseSplitwiseCsv(textValue),
            },
        ],
        skipped: [],
    }
}
