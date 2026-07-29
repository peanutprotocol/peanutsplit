import { describe, expect, it } from 'vitest'
import { roomSlugFromLink } from './recent-rooms'

const ORIGIN = 'http://localhost:3000'
const SLUG = 'lisbon-weekend-x7k2m9'

describe('roomSlugFromLink', () => {
    it.each([
        [`https://peanutsplit.com/r/${SLUG}`, SLUG],
        [`https://www.peanutsplit.com/r/${SLUG}/`, SLUG],
        [`peanutsplit.com/r/${SLUG}?utm_source=chat#room`, SLUG],
        [`/r/${SLUG}`, SLUG],
        [`${ORIGIN}/r/${SLUG}`, SLUG],
    ])('normalizes a valid room link without retaining URL decoration', (value, expected) => {
        expect(roomSlugFromLink(value, ORIGIN)).toBe(expected)
    })

    it.each([
        '',
        'not a URL',
        `https://example.com/r/${SLUG}`,
        `javascript://peanutsplit.com/r/${SLUG}`,
        `https://user:password@peanutsplit.com/r/${SLUG}`,
        'https://peanutsplit.com/',
        'https://peanutsplit.com/r/not-a-room',
        `https://peanutsplit.com/r/${SLUG}/extra`,
    ])('rejects invalid or non-Peanut credentials: %s', (value) => {
        expect(roomSlugFromLink(value, ORIGIN)).toBeNull()
    })
})
