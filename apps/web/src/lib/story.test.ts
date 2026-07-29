import { describe, expect, it } from 'vitest'
import { daySpan, storyBucketFor } from '@/lib/story'

const date = (iso: string) => new Date(iso)

describe('storyBucketFor', () => {
    it('a pair is a duo story whatever else the trip was', () => {
        // 9 days would qualify as a marathon; the duo reading wins.
        expect(storyBucketFor({ dayCount: 9, expenseCount: 14, memberCount: 2 })).toBe('duo')
    })

    it('a week earns the marathon line', () => {
        expect(storyBucketFor({ dayCount: 7, expenseCount: 2, memberCount: 4 })).toBe('marathon')
        expect(storyBucketFor({ dayCount: 6, expenseCount: 2, memberCount: 4 })).toBe('default')
    })

    it('one busy day is a blitz', () => {
        expect(storyBucketFor({ dayCount: 1, expenseCount: 3, memberCount: 4 })).toBe('blitz')
        // Two rounds is an evening, not a blitz.
        expect(storyBucketFor({ dayCount: 1, expenseCount: 2, memberCount: 4 })).toBe('default')
    })

    it('six people make a big group', () => {
        expect(storyBucketFor({ dayCount: 2, expenseCount: 2, memberCount: 6 })).toBe('bigGroup')
        expect(storyBucketFor({ dayCount: 2, expenseCount: 2, memberCount: 5 })).toBe('default')
    })

    it('a party of one falls through to the default line', () => {
        expect(storyBucketFor({ dayCount: 2, expenseCount: 2, memberCount: 1 })).toBe('default')
    })
})

describe('daySpan', () => {
    it('has no days without an expense', () => {
        expect(daySpan([])).toBe(0)
    })

    it('counts one expense as one day, not zero', () => {
        expect(daySpan([date('2026-07-04T09:00:00Z')])).toBe(1)
    })

    it('counts a same-day pair as one day', () => {
        expect(daySpan([date('2026-07-04T09:00:00Z'), date('2026-07-04T23:30:00Z')])).toBe(1)
    })

    it('is inclusive of both ends', () => {
        expect(daySpan([date('2026-07-01T12:00:00Z'), date('2026-07-09T12:00:00Z')])).toBe(9)
    })

    it('does not care what order the dates arrive in', () => {
        const unordered = [date('2026-07-09T01:00:00Z'), date('2026-07-01T22:00:00Z'), date('2026-07-05T10:00:00Z')]
        expect(daySpan(unordered)).toBe(9)
    })

    it('counts calendar days in UTC, so the answer is the same for every reader', () => {
        // One minute apart, two UTC days. A zone-relative count would make the
        // recap say "1 day" in São Paulo and "2 days" in Frankfurt.
        expect(daySpan([date('2026-07-04T23:59:00Z'), date('2026-07-05T00:01:00Z')])).toBe(2)
    })
})
