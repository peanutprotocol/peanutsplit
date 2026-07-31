import { describe, expect, it } from 'vitest'
import en from './messages/en.json'
import { asLocale, LOCALES } from './locales'
import { interpolate, pick, translate } from './t'
import type { Messages } from './messages'

const catalog = en as unknown as Messages

describe('pick', () => {
    it('walks a dot path to a leaf', () => {
        expect(pick(catalog, 'room.settle.back')).toBe('Back')
        expect(pick(catalog, 'dates.today')).toBe('Today')
    })

    it('misses rather than returning a namespace', () => {
        // `t('room')` must not render the JSON of every room string.
        expect(pick(catalog, 'room')).toBeUndefined()
        expect(pick(catalog, 'room.settle')).toBeUndefined()
    })

    it('misses on a path that runs off the end of the tree', () => {
        expect(pick(catalog, 'room.settle.back.deeper')).toBeUndefined()
        expect(pick(catalog, 'nope')).toBeUndefined()
        expect(pick(catalog, '')).toBeUndefined()
    })
})

describe('interpolate', () => {
    it('substitutes named params', () => {
        expect(interpolate('Hi {name}', { name: 'Ana' })).toBe('Hi Ana')
        expect(interpolate('{a} then {b}', { a: '1', b: '2' })).toBe('1 then 2')
        expect(interpolate('{n} people', { n: 3 })).toBe('3 people')
    })

    it('leaves an unfilled placeholder visible instead of blanking it', () => {
        // A gap says nothing; `{name}` on screen names exactly what was not passed.
        expect(interpolate('Hi {name}', {})).toBe('Hi {name}')
        expect(interpolate('Hi {name}', undefined)).toBe('Hi {name}')
    })

    it('repeats a param used more than once', () => {
        expect(interpolate('{x}-{x}', { x: 'a' })).toBe('a-a')
    })
})

describe('translate', () => {
    it('resolves in the requested locale', async () => {
        await expect(translate('es-419', 'dates.today')).resolves.toBe('Hoy')
        await expect(translate('pt-br', 'dates.today')).resolves.toBe('Hoje')
    })

    it('interpolates', async () => {
        await expect(translate('en', 'room.header.youAre', { name: 'Ana' })).resolves.toBe('you are Ana')
    })

    it('falls back to English before it falls back to the key', async () => {
        // 'unknown.key' exists nowhere, so it reaches the last resort.
        await expect(translate('es-419', 'unknown.key')).resolves.toBe('unknown.key')
    })

    it('treats an unsupported locale as English rather than failing to load a catalog', async () => {
        await expect(translate('fr', 'dates.today')).resolves.toBe('Today')
    })

    /**
     * `room.locale` holds whatever language the creator's page rendered in, and the rows written
     * before the codes carried a territory hold `es` and `pt-BR`. They are correct language tags
     * for the copy that was written, so a room started in Spanish keeps its Spanish unfurl rather
     * than silently reverting to English the day the codes changed.
     */
    it('reads a stored language tag rather than assuming English', async () => {
        await expect(translate('es', 'dates.today')).resolves.toBe('Hoy')
        await expect(translate('pt-BR', 'dates.today')).resolves.toBe('Hoje')
        await expect(translate('es-AR', 'dates.today')).resolves.toBe('Hoy')
        await expect(translate('en-GB', 'dates.today')).resolves.toBe('Today')
    })
})

describe('asLocale', () => {
    it('passes our own codes through untouched', () => {
        for (const locale of LOCALES) expect(asLocale(locale)).toBe(locale)
    })

    it('resolves a language tag to the locale that serves it', () => {
        expect(asLocale('es')).toBe('es-419')
        expect(asLocale('es-ES')).toBe('es-419')
        expect(asLocale('pt-BR')).toBe('pt-br')
        expect(asLocale('pt')).toBe('pt-br')
    })

    it('falls back to English for a language we do not ship', () => {
        expect(asLocale('fr')).toBe('en')
        expect(asLocale('')).toBe('en')
        expect(asLocale('not-a-tag')).toBe('en')
    })
})
