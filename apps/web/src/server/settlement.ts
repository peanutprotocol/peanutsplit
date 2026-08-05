import type { ApiTransfer } from '@/lib/api-types'

type BalanceEntry = { id: string; amount: bigint }

/**
 * The exact solver is exponential and runs synchronously inside `toRoomState`,
 * which is used for reads as well as writes. Keep fourfold state-space headroom
 * below the 20-member import ceiling: 18 nonzero balances need 262,144 subset
 * states, while 20 need 1,048,576. On the ambiguous performance fixture, warm
 * candidate measurements were 1.7-2.1ms at 16, 6.0-9.6ms at 18, and
 * 20.8-23.6ms at 20. Eighteen leaves fourfold state-space headroom for refetch
 * fanout while staying well inside the enforced budget. Larger rooms use greedy.
 */
export const EXACT_SETTLEMENT_MAX_NONZERO_BALANCES = 18

const byAmountThenId = (a: { id: string; amount: bigint }, b: { id: string; amount: bigint }) =>
    a.amount === b.amount ? a.id.localeCompare(b.id) : a.amount > b.amount ? -1 : 1

const byTransferAmountThenParties = (a: ApiTransfer, b: ApiTransfer) => {
    const aAmount = BigInt(a.amountMinor)
    const bAmount = BigInt(b.amountMinor)
    if (aAmount !== bAmount) return aAmount > bAmount ? -1 : 1
    const from = a.fromId.localeCompare(b.fromId)
    return from !== 0 ? from : a.toId.localeCompare(b.toId)
}

/** The established fallback: a deterministic, linear walk after the two sides
 * are sorted. It clears every valid balance map in at most n - 1 transfers. */
function greedySuggestedTransfers(balances: Map<string, bigint>): ApiTransfer[] {
    const entries = [...balances.entries()].map(([id, amount]) => ({ id, amount }))
    const debtors = entries
        .filter((entry) => entry.amount < 0n)
        .map((entry) => ({ id: entry.id, amount: -entry.amount }))
        .sort(byAmountThenId)
    const creditors = entries
        .filter((entry) => entry.amount > 0n)
        .map((entry) => ({ id: entry.id, amount: entry.amount }))
        .sort(byAmountThenId)

    const transfers: ApiTransfer[] = []
    let debtorIndex = 0
    let creditorIndex = 0
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
        const debtor = debtors[debtorIndex]
        const creditor = creditors[creditorIndex]
        const amount = debtor.amount < creditor.amount ? debtor.amount : creditor.amount
        if (amount > 0n) {
            transfers.push({ fromId: debtor.id, toId: creditor.id, amountMinor: amount.toString() })
        }
        debtor.amount -= amount
        creditor.amount -= amount
        if (debtor.amount === 0n) debtorIndex++
        if (creditor.amount === 0n) creditorIndex++
    }
    return transfers
}

/**
 * Partition nonzero balances into as many zero-sum groups as possible.
 *
 * If K is that maximum and m people have nonzero balances, an exact plan needs
 * m - K transfers: every zero-sum component of size s needs at least s - 1,
 * and the greedy walk realizes that bound inside each reconstructed component.
 *
 * `groups[mask]` is the greatest number of zero-sum prefixes in an ordering of
 * that subset. Appending one entry creates another group exactly when the whole
 * subset sums to zero. This is O(m * 2^m) time and O(2^m) memory.
 */
function exactSuggestedTransfers(entries: readonly BalanceEntry[]): ApiTransfer[] {
    if (entries.length === 0) return []

    // Canonical input order makes both DP tie-breaking and the resulting plan
    // independent of Map insertion order.
    const ordered = [...entries].sort((a, b) => a.id.localeCompare(b.id))
    const stateCount = 2 ** ordered.length
    // First this byte marks zero-sum subsets; the ascending DP can overwrite a
    // mask with its group count after every smaller predecessor is final. A
    // Gray-code walk finds those zero sums with one BigInt delta per mask, so
    // there is no 262k-element BigInt array on the serialization hot path.
    const groups = new Uint8Array(stateCount)
    let previousMask = 0
    let runningSum = 0n
    for (let step = 1; step < stateCount; step++) {
        const grayMask = step ^ (step >>> 1)
        const changedBit = grayMask ^ previousMask
        const changedIndex = 31 - Math.clz32(changedBit)
        runningSum += (grayMask & changedBit) !== 0 ? ordered[changedIndex].amount : -ordered[changedIndex].amount
        if (runningSum === 0n) groups[grayMask] = 1
        previousMask = grayMask
    }

    for (let mask = 1; mask < stateCount; mask++) {
        const closesGroup = groups[mask]
        let bestPreviousGroups = 0
        let candidates = mask
        while (candidates !== 0) {
            const bit = candidates & -candidates
            const previousGroups = groups[mask ^ bit]
            if (previousGroups > bestPreviousGroups) bestPreviousGroups = previousGroups
            candidates ^= bit
        }
        groups[mask] = bestPreviousGroups + closesGroup
    }

    // Recover any canonical predecessor that attains each stored optimum. Only
    // m masks are revisited, so recomputing their sums is O(m^2) and lets the
    // hot DP keep no BigInt sums or predecessor array.
    const order = new Array<number>(ordered.length)
    let mask = stateCount - 1
    for (let position = ordered.length - 1; position >= 0; position--) {
        let sum = 0n
        let summands = mask
        while (summands !== 0) {
            const bit = summands & -summands
            sum += ordered[31 - Math.clz32(bit)].amount
            summands ^= bit
        }

        const previousGroupCount = groups[mask] - (sum === 0n ? 1 : 0)
        let candidates = mask
        while (candidates !== 0) {
            const bit = candidates & -candidates
            if (groups[mask ^ bit] === previousGroupCount) {
                const index = 31 - Math.clz32(bit)
                order[position] = index
                mask ^= bit
                break
            }
            candidates ^= bit
        }
    }

    const zeroSumGroups: BalanceEntry[][] = []
    let current: BalanceEntry[] = []
    let currentSum = 0n
    for (const index of order) {
        const entry = ordered[index]
        current.push(entry)
        currentSum += entry.amount
        if (currentSum === 0n) {
            zeroSumGroups.push(current)
            current = []
        }
    }

    return zeroSumGroups.flatMap((group) =>
        greedySuggestedTransfers(new Map(group.map((entry) => [entry.id, entry.amount])))
    )
}

/**
 * An exact minimum-transfer plan for ordinary rooms, with the established
 * deterministic greedy plan as the bounded fallback for large or malformed
 * balance maps. The wire stays a generic list of suggestions either way.
 */
export function suggestedTransfers(balances: Map<string, bigint>): ApiTransfer[] {
    const nonzero = [...balances.entries()]
        .filter(([, amount]) => amount !== 0n)
        .map(([id, amount]) => ({ id, amount }))
    const total = nonzero.reduce((sum, entry) => sum + entry.amount, 0n)
    const greedy = greedySuggestedTransfers(balances)

    if (total !== 0n || nonzero.length > EXACT_SETTLEMENT_MAX_NONZERO_BALANCES) {
        return greedy
    }

    // Every nonzero debtor and creditor must touch at least one transfer. When
    // greedy reaches that lower bound it is already proven exact — the common
    // one-payer room avoids allocating even the compact subset table.
    const debtorCount = nonzero.filter((entry) => entry.amount < 0n).length
    const creditorCount = nonzero.length - debtorCount
    if (greedy.length === Math.max(debtorCount, creditorCount)) return greedy

    const exact = exactSuggestedTransfers(nonzero)
    // Preserve the established recipients and ordering whenever it was already
    // minimum; exact planning should only change a room when it removes a step.
    // Improved plans put the largest payment first, retaining the old walk's
    // useful first-card bias for the settle sheet and post-Aha share surface.
    return exact.length < greedy.length ? exact.sort(byTransferAmountThenParties) : greedy
}
