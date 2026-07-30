import { describe, expect, it } from 'vitest'
import { expenseLabel, expenseRowLabel, relativeTime } from './dates'

const EN = { locale: 'en', today: 'Today', yesterday: 'Yesterday' }

/** A fixed "now" so the buckets are asserted and not the clock. */
const NOW = new Date('2026-07-30T12:00:00.000Z')
const ago = (seconds: number): string => new Date(NOW.getTime() - seconds * 1000).toISOString()

const stamp = (iso: string, locale = 'en'): string => relativeTime(iso, { locale, justNow: 'just now' }, NOW)

describe('relativeTime — how long ago, coarser as it gets older', () => {
    it('says "just now" for anything under a minute, in both directions', () => {
        expect(stamp(ago(0))).toBe('just now')
        expect(stamp(ago(59))).toBe('just now')
        expect(stamp(ago(-30))).toBe('just now')
    })

    it('walks the buckets: minutes, hours, yesterday, days, weeks, months, years', () => {
        expect(stamp(ago(60))).toBe('1m ago')
        expect(stamp(ago(5 * 60))).toBe('5m ago')
        expect(stamp(ago(59 * 60 + 59))).toBe('59m ago')
        expect(stamp(ago(3 * 3600))).toBe('3h ago')
        expect(stamp(ago(23 * 3600))).toBe('23h ago')
        expect(stamp(ago(25 * 3600))).toBe('yesterday')
        expect(stamp(ago(5 * 86400))).toBe('5d ago')
        expect(stamp(ago(6 * 86400))).toBe('6d ago')
        expect(stamp(ago(7 * 86400))).toBe('1w ago')
        expect(stamp(ago(21 * 86400))).toBe('3w ago')
        expect(stamp(ago(31 * 86400))).toBe('1 month ago')
        expect(stamp(ago(300 * 86400))).toBe('9 months ago')
        expect(stamp(ago(400 * 86400))).toBe('1 year ago')
        expect(stamp(ago(1200 * 86400))).toBe('3 years ago')
    })

    it('counts calendar days, so "yesterday" is one day and never two', () => {
        // The bug this pins: dividing elapsed seconds by 86400 called anything
        // from 24h to 47h59m "yesterday", which is a day and a half of lying.
        expect(stamp(ago(47 * 3600 + 3599))).toBe('2d ago')
        expect(stamp(ago(48 * 3600))).toBe('2d ago')
        expect(stamp(ago(72 * 3600))).toBe('3d ago')
    })

    it('hands over from months to years at a real year, not at eleven months', () => {
        // floor(365 / 30.4375) is 11, so the month bucket used to render a full
        // year as "11mo ago".
        expect(stamp(ago(364 * 86400))).toBe('11 months ago')
        expect(stamp(ago(365 * 86400))).toBe('1 year ago')
        expect(stamp(ago(366 * 86400))).toBe('1 year ago')
    })

    it('reads forwards for a date somebody set in the future', () => {
        // The expense date is user-editable, so a future instant is legal input.
        expect(stamp(ago(-3 * 86400))).toBe('in 3d')
        expect(stamp(ago(-25 * 3600))).toBe('tomorrow')
        expect(stamp(ago(-48 * 3600))).toBe('in 2d')
    })

    it('says nothing at all for an instant it cannot parse', () => {
        // Intl.format throws a RangeError on NaN, which used to take the whole
        // room screen down with one unparseable field.
        expect(stamp('not a date')).toBe('')
        expect(stamp('')).toBe('')
    })

    it('localises the unit and the word order rather than the number alone', () => {
        expect(stamp(ago(5 * 60), 'es')).toBe('hace 5 min')
        expect(stamp(ago(25 * 3600), 'es')).toBe('ayer')
        expect(stamp(ago(21 * 86400), 'pt-BR')).toBe('há 3 sem.')
        expect(stamp(ago(30), 'pt-BR')).toBe('just now')
    })

    it('spells the coarse units out, because their Spanish abbreviation is one letter', () => {
        // "hace 1 m" is what narrow AND short give for a month in Spanish — the
        // same string a minute gets.
        expect(stamp(ago(31 * 86400), 'es')).toBe('hace 1 mes')
        expect(stamp(ago(400 * 86400), 'es')).toBe('hace 1 año')
        expect(stamp(ago(31 * 86400), 'pt-BR')).toBe('há 1 mês')
    })
})

describe('expenseLabel — a row with no name is named by its day', () => {
    it('uses the description whenever there is one', () => {
        expect(expenseLabel('Lift passes', ago(0), EN, NOW)).toBe('Lift passes')
    })

    it('falls back to the day for an empty, blank, null or absent name', () => {
        expect(expenseLabel('', ago(0), EN, NOW)).toBe('Today')
        expect(expenseLabel('   ', ago(0), EN, NOW)).toBe('Today')
        expect(expenseLabel(null, ago(0), EN, NOW)).toBe('Today')
        expect(expenseLabel(undefined, ago(0), EN, NOW)).toBe('Today')
    })

    it('names an older unnamed row by its date, never an empty string', () => {
        expect(expenseLabel('', ago(86400), EN, NOW)).toBe('Yesterday')
        expect(expenseLabel('', '2026-07-25T09:00:00.000Z', EN, NOW)).toBe('Sat, Jul 25')
        expect(expenseLabel('', '2024-03-04T09:00:00.000Z', EN, NOW)).toBe('Mon, Mar 4, 2024')
    })
})

describe('expenseRowLabel — under a day heading, the clock is what separates two rows', () => {
    it('uses the description whenever there is one', () => {
        expect(expenseRowLabel('Lift passes', ago(0), EN, NOW)).toBe('Lift passes')
    })

    it('never repeats the day heading it sits under, and never reads twice the same', () => {
        const heading = 'Today'
        const lunch = expenseRowLabel('', '2026-07-30T11:40:00.000Z', EN, NOW)
        const coffee = expenseRowLabel('', '2026-07-30T14:32:00.000Z', EN, NOW)
        expect(lunch).not.toBe(heading)
        expect(coffee).not.toBe(heading)
        expect(lunch).not.toBe(coffee)
        expect(lunch).toBe('Today, 11:40 AM')
        expect(coffee).toBe('Today, 2:32 PM')
    })

    it('takes the clock convention from the locale, not from us', () => {
        const ES = { locale: 'es', today: 'Hoy', yesterday: 'Ayer' }
        expect(expenseRowLabel('', '2026-07-30T14:32:00.000Z', ES, NOW)).toBe('Hoy, 14:32')
    })

    it('keeps the day for an older row, with its time', () => {
        expect(expenseRowLabel(null, '2026-07-25T09:05:00.000Z', EN, NOW)).toBe('Sat, Jul 25, 9:05 AM')
    })
})
