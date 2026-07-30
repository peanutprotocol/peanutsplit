/** Date helpers for the expense list. The API sorts by `date` desc; we only group. */

const dayKey = (iso: string): string => {
    const date = new Date(iso)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/**
 * The two relative labels are passed in rather than looked up here: this module is pure and has
 * no request context, and a `useTranslations` call would drag React into a date helper. The
 * caller already has `t` — it hands over the two words and the locale to format the rest with.
 */
export interface DayLabelOptions {
    /** BCP-47 tag for `toLocaleDateString`. Was hardcoded `en-GB`, which printed "Fri 25 Jul" at a Brazilian reader. */
    locale: string
    today: string
    yesterday: string
}

/** "Today" / "Yesterday" / "Fri 25 Jul" — a receipt, not a timestamp. */
export function dayLabel(iso: string, options: DayLabelOptions, now: Date = new Date()): string {
    const date = new Date(iso)
    const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
    if (days === 0) return options.today
    if (days === 1) return options.yesterday
    const sameYear = date.getFullYear() === now.getFullYear()
    return date.toLocaleDateString(options.locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
    })
}

/**
 * An expense's display name.
 *
 * The name is optional: most rows are typed one-handed at a table, and "the 40
 * euros from Tuesday" is a real way to remember one. A blank name falls back to
 * the day the expense happened, because that is the only other thing on the row
 * that identifies it — "Today", "Yesterday", "Fri 25 Jul". Never an empty span.
 */
export const expenseLabel = (
    description: string | null | undefined,
    iso: string,
    options: DayLabelOptions,
    now?: Date
): string => description?.trim() || dayLabel(iso, options, now)

/**
 * `justNow` is passed in for the reason `DayLabelOptions` gives. "Yesterday" is
 * NOT: `Intl` already has the word in every locale, in the lower-case inline
 * form this stamp wants, while `dates.yesterday` is the capitalised day heading.
 */
export interface RelativeTimeOptions {
    locale: string
    justNow: string
}

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
/** 30.4375 and 365.25 days — the average month and year, so "1mo ago" does not
 *  arrive on day 28 of a 31-day month. */
const MONTH = 2_629_800
const YEAR = 31_557_600

/**
 * Two formatters per locale, built once. A room with five hundred rows renders
 * five hundred stamps, and `Intl.RelativeTimeFormat` is expensive to construct.
 *
 * `narrow` is what makes it "5m ago" rather than "5 minutes ago", in every
 * locale and not only the one we happen to read it in. `numeric: 'always'` is
 * the default because `auto` turns -1 week into "last week" — this is a stamp,
 * not a sentence. The `auto` twin exists for one value, -1 day, where the word
 * IS what everybody says.
 */
const formatters = new Map<string, Intl.RelativeTimeFormat>()
const formatterFor = (locale: string, numeric: 'always' | 'auto'): Intl.RelativeTimeFormat => {
    const key = `${locale}:${numeric}`
    const cached = formatters.get(key)
    if (cached) return cached
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric, style: 'narrow' })
    formatters.set(key, formatter)
    return formatter
}

/**
 * "just now" / "5m ago" / "3h ago" / "yesterday" / "5d ago" / "3w ago" / "1mo ago" / "1y ago".
 *
 * Coarser as it gets older, on purpose: "how long ago" is the question anybody
 * asks about a row they might still be arguing about, and nobody asks it to the
 * minute about last spring. A future instant is legal — the expense date is
 * user-editable — and reads forwards ("in 3d").
 */
export function relativeTime(iso: string, options: RelativeTimeOptions, now: Date = new Date()): string {
    const elapsed = Math.round((now.getTime() - new Date(iso).getTime()) / 1000)
    const ago = Math.abs(elapsed)
    if (ago < MINUTE) return options.justNow

    const format = (value: number, unit: Intl.RelativeTimeFormatUnit): string =>
        formatterFor(options.locale, 'always').format(elapsed > 0 ? -value : value, unit)

    if (ago < HOUR) return format(Math.floor(ago / MINUTE), 'minute')
    if (ago < DAY) return format(Math.floor(ago / HOUR), 'hour')
    const days = Math.floor(ago / DAY)
    if (days === 1) return formatterFor(options.locale, 'auto').format(elapsed > 0 ? -1 : 1, 'day')
    if (ago < WEEK) return format(days, 'day')
    if (ago < MONTH) return format(Math.floor(ago / WEEK), 'week')
    if (ago < YEAR) return format(Math.floor(ago / MONTH), 'month')
    return format(Math.floor(ago / YEAR), 'year')
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
