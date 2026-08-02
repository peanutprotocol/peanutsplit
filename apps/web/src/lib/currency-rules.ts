/**
 * The two currency rules the server and the client have to agree on, in one file so they cannot
 * drift into two versions of the same switch.
 *
 * Neither function touches the catalog, the rate table or the network. They take the currency
 * facts already in hand — which is what lets `src/server/money.ts` call them with a
 * `CatalogCurrency` and the client call them with the `CurrencyInfo` off `/api/currencies`.
 */

/** Enough of a currency to decide how it prints. */
export interface CurrencyShape {
    code: string
    symbol: string
}

/** Enough of a currency to decide whether it can be converted. */
export interface RatedCurrency {
    code: string
    hasRate: boolean
}

/**
 * Put a formatted amount together with its currency.
 *
 * One rule: a currency with a symbol prints the symbol form (`-€12.34`), and a currency without
 * one prints the code after the amount (`-12.34 AED`). 61 of the 162 catalog codes have no symbol
 * and every custom ticker has none, so the second branch is a third of the product, not an edge
 * case. Without it those amounts print bare — a number with no currency at all.
 *
 * `sign` is separate because it always leads: `-€12.34`, never `€-12.34`.
 */
export function formatWithCurrency(sign: string, digits: string, currency: CurrencyShape): string {
    return currency.symbol ? `${sign}${currency.symbol}${digits}` : `${sign}${digits} ${currency.code}`
}

/**
 * Can an amount in `from` be converted into `to`?
 *
 * Every rate is anchored on USD, so a rate between two currencies exists exactly when both have
 * one — which makes this two lookups rather than a per-pair table. A currency is always
 * convertible into itself, checked first, so a room whose currency is a custom ticker still
 * accepts its own expenses.
 *
 * This answers the question for a catalog that was generated at deploy time. `rateFrom` answers
 * it for the rates actually loaded, and it is the gate: the server refuses a pair this predicate
 * would have allowed if the live feed has since dropped one of the two codes.
 */
export function canPrice(from: RatedCurrency, to: RatedCurrency): boolean {
    return from.code === to.code || (from.hasRate && to.hasRate)
}
