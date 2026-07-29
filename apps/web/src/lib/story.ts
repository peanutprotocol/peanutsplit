/**
 * The room's epilogue — which one-line story a settled room has earned.
 *
 * Every settled room gets a last line under its receipt ("9 days of 'I'll get
 * this one.' All square."), picked from a small pool by the shape of the trip.
 * The pool lives in the message catalogs under `room.story.*`; this module only
 * decides WHICH line, so the choice can be tested without a renderer.
 *
 * Selection is a pure function of stored room facts — no randomness, no
 * rotation. The line appears on screens that get screenshotted and next to a
 * cached recap artefact, so every member and every cache fill must read the
 * same sentence. A story that changes between two phones is a bug report, not
 * a delight.
 *
 * This module is imported by client components and by the OG pipeline alike,
 * so it must stay free of server imports.
 */

export type StoryBucket = 'duo' | 'marathon' | 'blitz' | 'bigGroup' | 'default'

export interface StoryFacts {
    dayCount: number
    expenseCount: number
    memberCount: number
}

/**
 * First match wins, most specific first. `duo` outranks `marathon` because "just
 * the two of you" is about the relationship and a two-person trip stays a
 * two-person story at any length; the time-shaped buckets follow; `bigGroup`
 * last among the specials because size is the least specific thing about a trip.
 *
 * The order also carries the copy's grammar guarantees: `marathon` only fires
 * with `days >= 7` and `blitz` with `expenses >= 3`, so the interpolated number
 * is always plural and the catalogs can use plain arguments instead of ICU
 * plural forms.
 */
export function storyBucketFor({ dayCount, expenseCount, memberCount }: StoryFacts): StoryBucket {
    if (memberCount === 2) return 'duo'
    if (dayCount >= 7) return 'marathon'
    if (dayCount <= 1 && expenseCount >= 3) return 'blitz'
    if (memberCount >= 6) return 'bigGroup'
    return 'default'
}

const DAY_MS = 86_400_000

/**
 * Days elapsed, counted in UTC calendar days and inclusive of both ends: one
 * expense is one day, not zero.
 *
 * UTC rather than a reader's zone because the count has to say the same thing to
 * everyone in the group — a card rendered for a crawler in Frankfurt and a page
 * read in São Paulo must not disagree about whether the trip was 9 days or 10.
 */
export function daySpan(dates: readonly Date[]): number {
    if (dates.length === 0) return 0
    let min = Infinity
    let max = -Infinity
    for (const date of dates) {
        const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS)
        if (day < min) min = day
        if (day > max) max = day
    }
    return max - min + 1
}
