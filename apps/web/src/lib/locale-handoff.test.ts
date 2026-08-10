import { describe, expect, it } from 'vitest'
import { LOCALES } from '@/i18n/locales'
import { localeFromNewRoomHandoff } from './locale-handoff'

const resolve = (pathname: string, search = '') => localeFromNewRoomHandoff(pathname, new URLSearchParams(search))

describe('localeFromNewRoomHandoff', () => {
    it('accepts every canonical locale on /new without consuming the other query parameters', () => {
        for (const locale of LOCALES) {
            const searchParams = new URLSearchParams(`utm_source=peanut.me&locale=${locale}&utm_campaign=split-content`)

            expect(localeFromNewRoomHandoff('/new', searchParams)).toBe(locale)
            expect(searchParams.toString()).toBe(`utm_source=peanut.me&locale=${locale}&utm_campaign=split-content`)
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
