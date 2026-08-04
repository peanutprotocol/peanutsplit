import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en.json'
import es419 from '@/i18n/messages/es-419.json'
import ptBr from '@/i18n/messages/pt-br.json'

/**
 * CREW counts durable ledger participants. It must never become a proxy for
 * devices that opened the link or a prompt to complete an invitation funnel.
 */
const catalogs = [
    {
        locale: 'en',
        messages: en,
        ledgerLanguage: /ledger|room keeps track of/i,
        rosterPressure: /missing|join|invite|everybody in|assembled|complete/i,
    },
    {
        locale: 'es-419',
        messages: es419,
        ledgerLanguage: /cuenta/i,
        rosterPressure: /falta|unirse|entrar|invit|estamos todos|complet[oa]/i,
    },
    {
        locale: 'pt-br',
        messages: ptBr,
        ledgerLanguage: /conta/i,
        rosterPressure: /falta|entrar|convid|todo mundo dentro|complet[oa]/i,
    },
] as const

describe('achievement copy guardrails', () => {
    it.each(catalogs)(
        '$locale describes CREW as a ledger snapshot without roster pressure',
        ({ messages, ledgerLanguage, rosterPressure }) => {
            const crew = messages.room.achievements.crew
            const surface = [
                crew.title,
                crew.body,
                messages.room.achievements.shareText.crew,
                messages.card.crew.line,
            ].join(' ')

            expect(crew).not.toHaveProperty('invite')
            expect(surface).toMatch(ledgerLanguage)
            expect(surface).not.toMatch(rosterPressure)
        }
    )

    it.each(catalogs)('$locale labels the recap as cards, not a locked progression', ({ messages }) => {
        expect(messages.room.achievements.shelfTitle).not.toMatch(/unlock|desbloque/i)
    })
})
