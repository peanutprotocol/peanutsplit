/** A regex that silently stops matching would leak room credentials to Sentry
 *  without anything failing — so every shape it has to catch is pinned here. */
import { describe, expect, it } from 'vitest'
import { redactField, redactRoomSlugs } from '@/lib/redact'

describe('redactRoomSlugs', () => {
    it('scrubs the room page URL', () => {
        expect(redactRoomSlugs('https://peanutsplit.com/r/ski-trip-x7k2m9')).toBe('https://peanutsplit.com/r/[slug]')
        expect(redactRoomSlugs('/r/ski-trip-x7k2m9/')).toBe('/r/[slug]/')
        expect(redactRoomSlugs('/r/ski-trip-x7k2m9?joined=1')).toBe('/r/[slug]?joined=1')
    })

    it('scrubs the API paths a fetch breadcrumb records', () => {
        expect(redactRoomSlugs('/api/rooms/ski-trip-x7k2m9/expenses')).toBe('/api/rooms/[slug]/expenses')
        expect(redactRoomSlugs('https://peanutsplit.com/api/rooms/ski-trip-x7k2m9')).toBe(
            'https://peanutsplit.com/api/rooms/[slug]'
        )
    })

    it('drops the card query, which names an award and a persona', () => {
        expect(redactRoomSlugs('/r/ski-trip-x7k2m9/card/alterego?a=theCloser&p=disco-octopus')).toBe(
            '/r/[slug]/card/alterego'
        )
        expect(redactRoomSlugs('https://peanutsplit.com/r/ski-trip-x7k2m9/card/crew')).toBe(
            'https://peanutsplit.com/r/[slug]/card/crew'
        )
        // A breadcrumb often carries a fragment after the query; only the query goes.
        expect(redactRoomSlugs('/r/ski-trip-x7k2m9/card/alterego?a=hypeCrew&p=wizard-frog#top')).toBe(
            '/r/[slug]/card/alterego#top'
        )
    })

    it('leaves slug-free strings alone', () => {
        expect(redactRoomSlugs('/new')).toBe('/new')
        expect(redactRoomSlugs('/api/currencies')).toBe('/api/currencies')
    })
})

describe('redactField', () => {
    it('rewrites a string field in place and ignores everything else', () => {
        const data: Record<string, unknown> = { url: '/r/ski-trip-x7k2m9', status: 200 }
        redactField(data, 'url')
        redactField(data, 'status')
        redactField(data, 'missing')
        redactField(undefined, 'url')
        expect(data).toEqual({ url: '/r/[slug]', status: 200 })
    })
})
