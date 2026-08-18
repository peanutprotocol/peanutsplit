import { describe, expect, it } from 'vitest'
import { asLocale, LOCALES } from './locales'
import { getTranslator, translate } from './t'

describe('translate', () => {
    it('resolves in the requested locale', async () => {
        await expect(translate('es-419', 'dates.today')).resolves.toBe('Hoy')
        await expect(translate('pt-br', 'dates.today')).resolves.toBe('Hoje')
    })

    it('interpolates', async () => {
        await expect(translate('en', 'room.header.youAre', { name: 'Ana' })).resolves.toBe('you are Ana')
    })

    it('uses next-intl ICU plurals outside React', async () => {
        const t = await getTranslator('en')
        expect(t('room.join.roster', { room: 'Lisbon', count: 1 })).toBe('Lisbon · 1 person so far')
        expect(t('room.join.roster', { room: 'Lisbon', count: 3 })).toBe('Lisbon · 3 people so far')
    })

    it('falls back to English before it falls back to the key', async () => {
        // 'unknown.key' exists nowhere, so it reaches the last resort.
        await expect(translate('es-419', 'unknown.key')).resolves.toBe('unknown.key')
    })

    it('treats an unsupported locale as English rather than failing to load a catalog', async () => {
        await expect(translate('it', 'dates.today')).resolves.toBe('Today')
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
        expect(asLocale('it')).toBe('en')
        expect(asLocale('')).toBe('en')
        expect(asLocale('not-a-tag')).toBe('en')
    })
})
