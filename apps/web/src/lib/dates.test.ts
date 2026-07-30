import { describe, expect, it } from 'vitest'
import { expenseLabel, relativeTime } from './dates'

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
        expect(stamp(ago(31 * 86400))).toBe('1mo ago')
        expect(stamp(ago(300 * 86400))).toBe('9mo ago')
        expect(stamp(ago(400 * 86400))).toBe('1y ago')
        expect(stamp(ago(1200 * 86400))).toBe('3y ago')
    })

    it('reads forwards for a date somebody set in the future', () => {
        // The expense date is user-editable, so a future instant is legal input.
        expect(stamp(ago(-3 * 86400))).toBe('in 3d')
        expect(stamp(ago(-25 * 3600))).toBe('tomorrow')
    })

    it('localises the unit and the word order rather than the number alone', () => {
        expect(stamp(ago(5 * 60), 'es')).toBe('hace 5 min')
        expect(stamp(ago(25 * 3600), 'es')).toBe('ayer')
        expect(stamp(ago(21 * 86400), 'pt-BR')).toBe('há 3 sem.')
        expect(stamp(ago(30), 'pt-BR')).toBe('just now')
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
