'use client'

/**
 * The indicative rate for one currency pair, for PREVIEW ONLY.
 *
 * Nothing here ever writes money. The server re-quotes the rate when the expense
 * is saved and its number is the one the balances are made of — this is the
 * figure shown next to "converted at an indicative rate" so the person typing
 * 12 000 ARS finds out it is about €8.82 before they save rather than after.
 *
 * There is deliberately no debounce around the request, because there is nothing
 * to debounce: the query is keyed on the PAIR, not on the amount, so typing into
 * the amount field never touches the network. One fetch per pair per hour, and
 * changing the amount is local arithmetic.
 */

import { useQuery } from '@tanstack/react-query'
import { api } from './api'

/** An hour. A rate that moves under someone mid-form would make the preview
 *  jump for no reason they can see, and the server re-quotes on save anyway. */
const RATE_STALE_MS = 60 * 60 * 1000

export function useRate(from: string, to: string) {
    return useQuery({
        queryKey: ['rate', from, to] as const,
        queryFn: ({ signal }) => api.rate(from, to, signal),
        // Same-currency is not a conversion, and the route would reject it.
        enabled: from !== to && from.length > 0 && to.length > 0,
        staleTime: RATE_STALE_MS,
        // A failed probe means "no preview". Retrying would put a number on
        // screen seconds late, after the eye has already moved on.
        retry: false,
        refetchOnWindowFocus: false,
    })
}

/**
 * Minor units in `from` → minor units in `to`, at `rate`, half-up.
 *
 * Mirrors the server's `convertMinorAtRate` (apps/web/src/server/money.ts) in
 * shape, but stays in `Number`: the value never leaves the screen, and an
 * indicative preview that disagrees with the saved amount by a cent is not a
 * bug, it is what "indicative" means. Returns null on anything unusable rather
 * than rendering NaN.
 */
export function convertMinorForPreview(
    minor: string,
    rate: number,
    fromDecimals: number,
    toDecimals: number
): string | null {
    if (!Number.isFinite(rate) || rate <= 0) return null
    const parsed = Number(minor)
    if (!Number.isFinite(parsed)) return null
    const major = parsed / 10 ** fromDecimals
    const converted = Math.round(major * rate * 10 ** toDecimals)
    if (!Number.isFinite(converted)) return null
    return String(converted)
}
