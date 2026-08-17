/**
 * Amount-parsing shared by `<Script>`'s server render (`components/marketing/mdx/Script.tsx`) and
 * the plain-DOM live-recompute listener (`script-enhancer-dom.ts`) — fun-engine.md S4. Both sides
 * of the server/client boundary need the identical match, so it lives here once rather than being
 * reimplemented on each side.
 */

/** The first currency-shaped token in a message — "€12", "12.50 EUR", "$8". */
const AMOUNT = /[€$£]\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?(?:EUR|USD|GBP)/i

/** The three currencies `AMOUNT` can match, by symbol. Nothing else reaches this function. */
const CURRENCY_BY_SYMBOL: Record<string, string> = { '€': 'EUR', $: 'USD', '£': 'GBP' }

/** Which of the three currencies a matched amount is in, or null once every symbol/code trace of
 *  one has been edited away — the confirmation row then disappears. */
export function currencyOf(matched: string): string | null {
    const symbol = matched.match(/[€$£]/)?.[0]
    if (symbol) return CURRENCY_BY_SYMBOL[symbol]
    return matched.match(/EUR|USD|GBP/i)?.[0].toUpperCase() ?? null
}

/** Splits a message into its amount token (empty string if none) and everything else. */
export function splitScriptMessage(text: string): { rest: string; amount: string } {
    const amount = text.match(AMOUNT)?.[0] ?? ''
    const rest = amount ? text.replace(amount, '').trim() : text
    return { rest, amount }
}
