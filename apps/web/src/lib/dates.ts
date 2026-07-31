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

/** "14:32" / "2:32 PM" — the reader's own clock convention, not ours. Seconds
 *  are opt-in: `expenseRowLabel` needs them to tell apart two unnamed expenses
 *  filed in the same minute, but nothing else that reads a clock face does. */
const timeOfDay = (date: Date, locale: string, withSeconds = false): string =>
    date.toLocaleTimeString(locale, {
        hour: 'numeric',
        minute: '2-digit',
        ...(withSeconds ? { second: '2-digit' } : {}),
    })

/**
 * An expense's display name.
 *
 * The name is optional: most rows are typed one-handed at a table, and "the 40
 * euros from Tuesday" is a real way to remember one. A blank name falls back to
 * the day the expense happened, because that is the only other thing on the row
 * that identifies it — "Today", "Yesterday", "Fri 25 Jul". Never an empty span.
 *
 * Use this where the day is NOT already on screen. Under a day heading, use
 * `expenseRowLabel`.
 */
export const expenseLabel = (
    description: string | null | undefined,
    iso: string,
    options: DayLabelOptions,
    now?: Date
): string => description?.trim() || dayLabel(iso, options, now)

/**
 * The same label, for a row that sits under a day heading.
 *
 * The plain day is the wrong fallback there and was a real defect: the list
 * groups by day, so an unnamed row printed the heading it was already sitting
 * under, character for character, and two unnamed rows from the same lunch were
 * one indistinguishable pair. The time of day is the one thing that separates
 * them, and it is also what a person reaches for — "the 40 euros from just after
 * lunch". So the fallback here is the day AND the clock: "Today, 2:32 PM".
 *
 * The clock carries seconds. Settling up at a table is the ordinary case this
 * fallback exists for, and two rounds typed one-handed in the same minute is
 * the ordinary shape of that — a minute-only clock reprints the exact same
 * fallback for both and the defect above is back, just one field over. Seconds
 * are real elapsed time, not an invented ordinal, so "Today, 2:32:07 PM" stays
 * honest about what actually separates the two rows.
 */
export const expenseRowLabel = (
    description: string | null | undefined,
    iso: string,
    options: DayLabelOptions,
    now?: Date
): string => {
    const name = description?.trim()
    if (name) return name
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return dayLabel(iso, options, now)
    return `${dayLabel(iso, options, now)}, ${timeOfDay(date, options.locale, true)}`
}

/**
 * `justNow` is passed in for the reason `DayLabelOptions` gives. "Yesterday" is
 * NOT: `Intl` already has the word in every locale, in the lower-case inline
 * form this stamp wants, while `dates.yesterday` is the capitalised day heading.
 */
export interface RelativeTimeOptions {
    locale: string
    justNow: string
}

/** Seconds — the sub-day buckets are elapsed time and nothing else. */
const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Days. 30.4375 is the average month, so "1mo ago" does not arrive on day 28 of
 *  a 31-day month. The year switch is a flat 365 rather than the average 365.25,
 *  because 365 / 365.25 floors to 0 and "0y ago" is not a thing to render; the
 *  month bucket has to hand over before that. */
const DAYS_PER_WEEK = 7
const DAYS_PER_MONTH = 30.4375
const DAYS_PER_YEAR = 365.25
const A_YEAR_IN_DAYS = 365

/**
 * Narrow, except for months and years.
 *
 * `narrow` is what makes it "5m ago" rather than "5 minutes ago", in every
 * locale and not only the one we happen to read it in. On the two coarse units
 * it stops being an abbreviation and becomes a single letter: CLDR's Spanish
 * narrow month is "hace 1 m" — and `short` is the same string, so it is no
 * escape — which is a month rendered as a minute. `long` is the only style with
 * a Spanish month a person can read, and this far out the extra characters cost
 * nothing: "1 month ago", "hace 1 mes", "há 1 mês".
 */
const styleFor = (unit: Intl.RelativeTimeFormatUnit): 'narrow' | 'long' =>
    unit === 'month' || unit === 'year' ? 'long' : 'narrow'

/**
 * One formatter per locale, numeric mode and style, built once. A room with five
 * hundred rows renders five hundred stamps, and `Intl.RelativeTimeFormat` is
 * expensive to construct.
 *
 * `numeric: 'always'` is the default because `auto` turns -1 week into "last
 * week" — this is a stamp, not a sentence. The `auto` twin exists for one value,
 * -1 day, where the word IS what everybody says.
 */
const formatters = new Map<string, Intl.RelativeTimeFormat>()
const formatterFor = (
    locale: string,
    numeric: 'always' | 'auto',
    style: 'narrow' | 'long'
): Intl.RelativeTimeFormat => {
    const key = `${locale}:${numeric}:${style}`
    const cached = formatters.get(key)
    if (cached) return cached
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric, style })
    formatters.set(key, formatter)
    return formatter
}

/**
 * "just now" / "5m ago" / "3h ago" / "yesterday" / "5d ago" / "3w ago" / "1 month ago" / "1 year ago".
 *
 * Coarser as it gets older, on purpose: "how long ago" is the question anybody
 * asks about a row they might still be arguing about, and nobody asks it to the
 * minute about last spring. A future instant is legal — the expense date is
 * user-editable — and reads forwards ("in 3d").
 *
 * Under a day it counts elapsed time. Past that it counts CALENDAR days, which
 * is the unit the words themselves mean: "yesterday" is a day on the phone's own
 * calendar, not a 24-to-48-hour window, and dividing elapsed seconds by 86400
 * called 47 hours ago "yesterday" for a full day longer than it was true.
 */
export function relativeTime(iso: string, options: RelativeTimeOptions, now: Date = new Date()): string {
    const then = new Date(iso)
    // A stamp is decoration on a row that has to render. An unparseable instant
    // reached `Intl.format` as NaN and threw a RangeError, which took the whole
    // room screen with it — no stamp is the only acceptable failure here.
    if (Number.isNaN(then.getTime())) return ''

    const elapsed = Math.round((now.getTime() - then.getTime()) / 1000)
    const ago = Math.abs(elapsed)
    if (ago < MINUTE) return options.justNow

    const format = (value: number, unit: Intl.RelativeTimeFormatUnit): string =>
        formatterFor(options.locale, 'always', styleFor(unit)).format(elapsed > 0 ? -value : value, unit)

    if (ago < HOUR) return format(Math.floor(ago / MINUTE), 'minute')
    if (ago < DAY) return format(Math.floor(ago / HOUR), 'hour')

    // Never below 1: on a DST fall-back day, 24+ elapsed hours can still land on
    // the same calendar day, and "0d ago" is not a thing to render.
    const days = Math.max(1, Math.abs(Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000)))
    if (days === 1) return formatterFor(options.locale, 'auto', 'narrow').format(elapsed > 0 ? -1 : 1, 'day')
    if (days < DAYS_PER_WEEK) return format(days, 'day')
    if (days < DAYS_PER_MONTH) return format(Math.floor(days / DAYS_PER_WEEK), 'week')
    if (days < A_YEAR_IN_DAYS) return format(Math.floor(days / DAYS_PER_MONTH), 'month')
    return format(Math.max(1, Math.floor(days / DAYS_PER_YEAR)), 'year')
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
