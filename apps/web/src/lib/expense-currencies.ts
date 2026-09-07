/** Personal expense preferences on this device, separate for each room and claimed member. */
const storageKey = (slug: string, memberId: string) => `ps:expense-currencies:${slug}:${memberId}`

const distinctCurrencies = (value: unknown): string[] =>
    Array.isArray(value)
        ? [...new Set(value.filter((code): code is string => typeof code === 'string' && /^[A-Z]{3,4}$/.test(code)))]
        : []

export function expenseCurrencyShortlist(recents: readonly string[], roomCurrency: string): string[] {
    return [...new Set([...distinctCurrencies(recents).slice(0, 2), roomCurrency, 'USD', 'EUR', 'GBP'])].slice(0, 3)
}

export function readExpenseCurrencies(slug: string, memberId?: string): string[] {
    if (!memberId || typeof window === 'undefined') return []
    try {
        return distinctCurrencies(JSON.parse(window.localStorage.getItem(storageKey(slug, memberId)) ?? 'null')).slice(
            0,
            2
        )
    } catch {
        return []
    }
}

/** Call only after the server accepts a save, never on selection or optimistic/offline enqueue. */
export function rememberExpenseCurrency(slug: string, memberId: string | undefined, currency: string): void {
    if (!memberId || typeof window === 'undefined') return
    try {
        const next = distinctCurrencies([currency, ...readExpenseCurrencies(slug, memberId)]).slice(0, 2)
        window.localStorage.setItem(storageKey(slug, memberId), JSON.stringify(next))
    } catch {
        // A blocked or full preference store must never turn a saved expense into an error.
    }
}
