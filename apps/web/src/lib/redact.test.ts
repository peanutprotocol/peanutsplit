/** A regex that silently stops matching would leak room credentials to Sentry
 *  without anything failing — so every shape it has to catch is pinned here. */
import { describe, expect, it } from 'vitest'
import { redactField, redactRoomSlugs, redactTelemetryEvent } from '@/lib/redact'

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

    it('scrubs the slug query parameter the native app’s room pages use', () => {
        expect(redactRoomSlugs('capacitor://localhost/room/?slug=ski-trip-kunc-syrup-drum&add=1')).toBe(
            'capacitor://localhost/room/?slug=[slug]&add=1'
        )
        expect(redactRoomSlugs('https://localhost/room/import/?slug=ski-trip-kunc-syrup-drum')).toBe(
            'https://localhost/room/import/?slug=[slug]'
        )
        expect(redactRoomSlugs('https://localhost/room/?add=1&slug=ski-trip-kunc-syrup-drum#expenses')).toBe(
            'https://localhost/room/?add=1&slug=[slug]#expenses'
        )
    })

    it('scrubs any slug parameter, on purpose, even outside a room path', () => {
        // Over-redacting an unrelated `slug=` loses a little debugging detail; a narrower rule
        // would leak a room credential the first time a new page passes one.
        expect(redactRoomSlugs('https://peanutsplit.com/blog/?slug=splitwise-alternative')).toBe(
            'https://peanutsplit.com/blog/?slug=[slug]'
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

describe('redactTelemetryEvent', () => {
    it('scrubs a room capability from every string-bearing Sentry boundary', () => {
        const capability = 'ski-trip-x7k2m9'
        const event = redactTelemetryEvent({
            message: `Could not load /r/${capability}`,
            transaction: `/r/${capability}`,
            request: {
                url: `https://peanutsplit.com/r/${capability}`,
                headers: { Referer: `https://peanutsplit.com/r/${capability}`, referer: `/r/${capability}` },
            },
            exception: { values: [{ value: `Fetch failed at /api/rooms/${capability}/expenses` }] },
            breadcrumbs: [
                {
                    message: `Navigated from /r/${capability}`,
                    data: {
                        url: `/api/rooms/${capability}`,
                        from: `/r/${capability}`,
                        to: `/r/${capability}/recap`,
                    },
                },
            ],
        })

        expect(JSON.stringify(event)).not.toContain(capability)
        expect(event).toMatchObject({
            message: 'Could not load /r/[slug]',
            transaction: '/r/[slug]',
            request: { url: 'https://peanutsplit.com/r/[slug]' },
            exception: { values: [{ value: 'Fetch failed at /api/rooms/[slug]/expenses' }] },
            breadcrumbs: [{ message: 'Navigated from /r/[slug]' }],
        })
    })

    it('scrubs the native app’s slug query from breadcrumbs and exception text', () => {
        const capability = 'ski-trip-kunc-syrup-drum'
        const event = redactTelemetryEvent({
            exception: {
                values: [{ value: `Failed to load capacitor://localhost/room/?slug=${capability}&add=1` }],
            },
            breadcrumbs: [
                {
                    message: `Navigated to /room/?slug=${capability}`,
                    data: {
                        from: 'capacitor://localhost/app/',
                        to: `capacitor://localhost/room/?slug=${capability}&add=1`,
                        url: `https://localhost/room/import/?slug=${capability}`,
                    },
                },
            ],
        })

        expect(JSON.stringify(event)).not.toContain(capability)
        expect(event).toEqual({
            exception: { values: [{ value: 'Failed to load capacitor://localhost/room/?slug=[slug]&add=1' }] },
            breadcrumbs: [
                {
                    message: 'Navigated to /room/?slug=[slug]',
                    data: {
                        from: 'capacitor://localhost/app/',
                        to: 'capacitor://localhost/room/?slug=[slug]&add=1',
                        url: 'https://localhost/room/import/?slug=[slug]',
                    },
                },
            ],
        })
    })
})
