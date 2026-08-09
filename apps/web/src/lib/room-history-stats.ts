import type { RoomState } from './api-types'
import { savedExpenses } from './pending'

/** A member total in the room currency. Member ids deliberately remain valid
 * for former members: removing somebody must not rewrite historical spend. */
export interface RoomHistoryMemberAmount {
    /** Every co-winner, in stable code-unit order. */
    memberIds: string[]
    amountMinor: string
}

/** One calendar month, read from the user-authored expense date. */
export interface RoomHistoryMonthTotal {
    /** `YYYY-MM`, suitable for locale-aware formatting by the caller. */
    month: string
    amountMinor: string
    expenseCount: number
}

export interface RoomHistoryCategoryTotal {
    category: string
    amountMinor: string
    expenseCount: number
}

export interface RoomHistoryDayTotal {
    /** `YYYY-MM-DD`, suitable for locale-aware formatting by the caller. */
    day: string
    amountMinor: string
    expenseCount: number
}

export interface RoomHistoryReactedExpense {
    expenseId: string
    reactionCount: number
}

export interface RoomHistoryCommunalExpense {
    expenseId: string
    participantCount: number
}

export interface RoomHistoryMonthToDatePeriod {
    /** `YYYY-MM`, read in the viewer's local calendar. */
    month: string
    /** The inclusive day-of-month cutoff used for this side of the comparison. */
    throughDay: number
    amountMinor: string
}

export type RoomHistoryMonthToDateComparisonKind = 'no-spend' | 'new-spend' | 'increase' | 'decrease' | 'unchanged'

export interface RoomHistoryMonthToDateComparison {
    current: RoomHistoryMonthToDatePeriod
    previous: RoomHistoryMonthToDatePeriod
    kind: RoomHistoryMonthToDateComparisonKind
    /** Signed whole percent, rounded half-up. Null when the previous total is zero. */
    percentChange: string | null
}

export interface RoomHistoryStats {
    expenseCount: number
    /** Every amount is in the room currency, derived from frozen base amounts. */
    totalMinor: string
    /** Nearest room-currency minor unit, rounded half-up. Null for an empty room. */
    averageExpenseMinor: string | null
    /** Sum of allocated shares per member — who consumed the largest share. */
    largestAllocatedShareByMember: RoomHistoryMemberAmount | null
    /** Sum of expense base amounts per payer — who advanced the most money. */
    frontedMostByMember: RoomHistoryMemberAmount | null
    /** Oldest month first. */
    monthlyTotals: RoomHistoryMonthTotal[]
    /** Current month through today versus the same available calendar days last month. */
    monthToDateComparison: RoomHistoryMonthToDateComparison
    /** Uncategorized expenses do not compete. */
    topCategory: RoomHistoryCategoryTotal | null
    peakSpendDay: RoomHistoryDayTotal | null
    /** Null until at least one reaction exists. */
    mostReactedExpense: RoomHistoryReactedExpense | null
    /** Null until an expense allocates positive shares to at least two people. */
    mostCommunalExpense: RoomHistoryCommunalExpense | null
    /** Distinct expense currencies, in stable code-unit order. */
    distinctCurrencies: string[]
}

interface AmountBucket {
    amount: bigint
    expenseCount: number
}

const addAmount = (totals: Map<string, bigint>, key: string, amount: bigint): void => {
    totals.set(key, (totals.get(key) ?? 0n) + amount)
}

const addBucket = (totals: Map<string, AmountBucket>, key: string, amount: bigint): void => {
    const current = totals.get(key)
    totals.set(key, {
        amount: (current?.amount ?? 0n) + amount,
        expenseCount: (current?.expenseCount ?? 0) + 1,
    })
}

/** Code-unit comparisons are stable across browsers and ICU builds. */
const before = (left: string, right: string): boolean => left < right

const topAmount = (totals: Map<string, bigint>): RoomHistoryMemberAmount | null => {
    let winningAmount = -1n

    for (const amount of totals.values()) if (amount > winningAmount) winningAmount = amount
    if (winningAmount < 0n) return null

    return {
        memberIds: [...totals]
            .filter(([, amount]) => amount === winningAmount)
            .map(([memberId]) => memberId)
            .sort((left, right) => (before(left, right) ? -1 : before(right, left) ? 1 : 0)),
        amountMinor: winningAmount.toString(),
    }
}

const topBucket = (totals: Map<string, AmountBucket>): { key: string; bucket: AmountBucket } | null => {
    let winner: { key: string; bucket: AmountBucket } | null = null

    for (const [key, bucket] of totals) {
        if (
            winner === null ||
            bucket.amount > winner.bucket.amount ||
            (bucket.amount === winner.bucket.amount && before(key, winner.key))
        ) {
            winner = { key, bucket }
        }
    }

    return winner
}

const calendarDay = (date: string): string | null => {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(date)
    return match?.[1] ?? null
}

interface CalendarDate {
    year: number
    month: number
    day: number
}

const localCalendarDate = (date: Date): CalendarDate => ({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
})

const monthKey = (year: number, month: number): string =>
    `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`

const isLeapYear = (year: number): boolean => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const daysInMonth = (year: number, month: number): number => {
    if (month === 2) return isLeapYear(year) ? 29 : 28
    return [4, 6, 9, 11].includes(month) ? 30 : 31
}

const previousMonth = ({ year, month }: CalendarDate): Pick<CalendarDate, 'year' | 'month'> =>
    month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }

const signedPercentChange = (current: bigint, previous: bigint): string | null => {
    if (previous === 0n) return null
    const delta = current - previous
    if (delta === 0n) return '0'
    const magnitude = delta < 0n ? -delta : delta
    const rounded = (magnitude * 100n + previous / 2n) / previous
    return (delta < 0n ? -rounded : rounded).toString()
}

const monthToDateComparison = (
    expenses: ReturnType<typeof savedExpenses>,
    now: Date
): RoomHistoryMonthToDateComparison => {
    const currentDate = localCalendarDate(now)
    const previousDate = previousMonth(currentDate)
    const currentMonth = monthKey(currentDate.year, currentDate.month)
    const previousMonthKey = monthKey(previousDate.year, previousDate.month)
    const previousThroughDay = Math.min(currentDate.day, daysInMonth(previousDate.year, previousDate.month))
    let current = 0n
    let previous = 0n

    for (const expense of expenses) {
        const day = calendarDay(expense.date)
        if (day === null) continue
        const dayOfMonth = Number(day.slice(8, 10))
        const amount = BigInt(expense.baseAmountMinor)

        if (day.startsWith(currentMonth) && dayOfMonth <= currentDate.day) current += amount
        else if (day.startsWith(previousMonthKey) && dayOfMonth <= previousThroughDay) previous += amount
    }

    const kind: RoomHistoryMonthToDateComparisonKind =
        previous === 0n
            ? current === 0n
                ? 'no-spend'
                : 'new-spend'
            : current > previous
              ? 'increase'
              : current < previous
                ? 'decrease'
                : 'unchanged'

    return {
        current: { month: currentMonth, throughDay: currentDate.day, amountMinor: current.toString() },
        previous: { month: previousMonthKey, throughDay: previousThroughDay, amountMinor: previous.toString() },
        kind,
        percentChange: signedPercentChange(current, previous),
    }
}

const roundedAverage = (total: bigint, count: number): string => {
    const divisor = BigInt(count)
    return ((total + divisor / 2n) / divisor).toString()
}

/**
 * Derive room-history insights from the current, non-deleted ledger snapshot.
 *
 * Expense edits appear only in their current form, so they cannot be double
 * counted as they would be in the append-only audit stream. The wire contract
 * guarantees decimal minor-unit strings; every aggregate remains BigInt until
 * it crosses this module's JSON-safe output boundary.
 */
export function roomHistoryStats(state: RoomState, now: Date = new Date()): RoomHistoryStats {
    const expenses = savedExpenses(state.expenses)
    let total = 0n
    const allocatedByMember = new Map<string, bigint>()
    const frontedByMember = new Map<string, bigint>()
    const byMonth = new Map<string, AmountBucket>()
    const byCategory = new Map<string, AmountBucket>()
    const byDay = new Map<string, AmountBucket>()
    const currencies = new Set<string>()
    let mostReacted: RoomHistoryReactedExpense | null = null
    let mostCommunal: RoomHistoryCommunalExpense | null = null

    for (const expense of expenses) {
        const amount = BigInt(expense.baseAmountMinor)
        total += amount
        addAmount(frontedByMember, expense.paidById, amount)
        currencies.add(expense.currency)

        for (const share of expense.shares) {
            addAmount(allocatedByMember, share.memberId, BigInt(share.amountMinor))
        }

        const day = calendarDay(expense.date)
        if (day !== null) {
            addBucket(byDay, day, amount)
            addBucket(byMonth, day.slice(0, 7), amount)
        }

        const category = expense.category?.trim()
        if (category) addBucket(byCategory, category, amount)

        const reactionCount = expense.reactions.length
        if (
            reactionCount > 0 &&
            (mostReacted === null ||
                reactionCount > mostReacted.reactionCount ||
                (reactionCount === mostReacted.reactionCount && before(expense.id, mostReacted.expenseId)))
        ) {
            mostReacted = { expenseId: expense.id, reactionCount }
        }

        const participantCount = new Set(
            expense.shares.filter((share) => BigInt(share.amountMinor) > 0n).map((share) => share.memberId)
        ).size
        if (
            participantCount >= 2 &&
            (mostCommunal === null ||
                participantCount > mostCommunal.participantCount ||
                (participantCount === mostCommunal.participantCount && before(expense.id, mostCommunal.expenseId)))
        ) {
            mostCommunal = { expenseId: expense.id, participantCount }
        }
    }

    const topCategory = topBucket(byCategory)
    const peakDay = topBucket(byDay)

    return {
        expenseCount: expenses.length,
        totalMinor: total.toString(),
        averageExpenseMinor: expenses.length === 0 ? null : roundedAverage(total, expenses.length),
        largestAllocatedShareByMember: topAmount(allocatedByMember),
        frontedMostByMember: topAmount(frontedByMember),
        monthlyTotals: [...byMonth]
            .sort(([left], [right]) => (before(left, right) ? -1 : before(right, left) ? 1 : 0))
            .map(([month, bucket]) => ({
                month,
                amountMinor: bucket.amount.toString(),
                expenseCount: bucket.expenseCount,
            })),
        monthToDateComparison: monthToDateComparison(expenses, now),
        topCategory: topCategory
            ? {
                  category: topCategory.key,
                  amountMinor: topCategory.bucket.amount.toString(),
                  expenseCount: topCategory.bucket.expenseCount,
              }
            : null,
        peakSpendDay: peakDay
            ? {
                  day: peakDay.key,
                  amountMinor: peakDay.bucket.amount.toString(),
                  expenseCount: peakDay.bucket.expenseCount,
              }
            : null,
        mostReactedExpense: mostReacted,
        mostCommunalExpense: mostCommunal,
        distinctCurrencies: [...currencies].sort((left, right) =>
            before(left, right) ? -1 : before(right, left) ? 1 : 0
        ),
    }
}
