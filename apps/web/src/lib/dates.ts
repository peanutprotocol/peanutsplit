/** Date helpers for the expense list. The API sorts by `date` desc; we only group. */

const dayKey = (iso: string): string => {
    const date = new Date(iso)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** "Today" / "Yesterday" / "Fri 25 Jul" — a receipt, not a timestamp. */
export function dayLabel(iso: string, now: Date = new Date()): string {
    const date = new Date(iso)
    const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    const sameYear = date.getFullYear() === now.getFullYear()
    return date.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
    })
}

/** Group items by calendar day, preserving the incoming order. */
export function groupByDay<T>(items: readonly T[], dateOf: (item: T) => string): { key: string; items: T[] }[] {
    const groups: { key: string; items: T[] }[] = []
    for (const item of items) {
        const key = dayKey(dateOf(item))
        const last = groups[groups.length - 1]
        if (last && last.key === key) last.items.push(item)
        else groups.push({ key, items: [item] })
    }
    return groups
}

/** `<input type="date">` wants a local YYYY-MM-DD, not an ISO instant. */
export const toDateInputValue = (iso: string): string => dayKey(iso)

/** Keep the time-of-day from the original instant so same-day ordering survives an edit. */
export function fromDateInputValue(value: string, previousIso: string): string {
    const [year, month, day] = value.split('-').map(Number)
    if (!year || !month || !day) return previousIso
    const previous = new Date(previousIso)
    const next = new Date(previous)
    next.setFullYear(year, month - 1, day)
    return next.toISOString()
}
