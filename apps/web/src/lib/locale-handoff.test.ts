import { describe, expect, it } from 'vitest'
import { LOCALES } from '@/i18n/locales'
import { localeFromNewRoomHandoff } from './locale-handoff'

const resolve = (pathname: string, search = '') => localeFromNewRoomHandoff(pathname, new URLSearchParams(search))

describe('localeFromNewRoomHandoff', () => {
    // The query is the one every published guide CTA emits, copied from a rendered body:
    // `locale` first, then the four campaign parameters. Guides ship from this repo and hand off
    // to `/new` on this same origin, so the source is the guide, not a second site.
    const ctaSearch = (locale: string) =>
        `locale=${locale}&utm_medium=content&utm_source=split-guide` +
        '&utm_campaign=ask-a-friend-to-pay-you-back&utm_content=final-cta'

    it('accepts every canonical locale on /new without consuming the other query parameters', () => {
        for (const locale of LOCALES) {
            const searchParams = new URLSearchParams(ctaSearch(locale))

            expect(localeFromNewRoomHandoff('/new', searchParams)).toBe(locale)
            expect(searchParams.toString()).toBe(ctaSearch(locale))
        }
    })

    it('ignores missing, invalid, legacy and non-canonical locale values', () => {
        for (const search of [
            '',
            'locale=',
            'locale=es',
            'locale=pt-BR',
            'locale=EN',
            'locale=fr',
            'locale=%20en%20',
        ]) {
            expect(resolve('/new', search)).toBeNull()
        }
    })

    it('does not turn locale query parameters into routing outside the exact /new path', () => {
        for (const pathname of ['/', '/app', '/new/', '/r/example', '/es-419/new']) {
            expect(resolve(pathname, 'locale=es-419')).toBeNull()
        }
    })
})
