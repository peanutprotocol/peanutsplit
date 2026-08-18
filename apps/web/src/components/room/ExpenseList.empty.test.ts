import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en.json'
import es419 from '@/i18n/messages/es-419.json'
import ptBr from '@/i18n/messages/pt-br.json'

describe('the empty-room funnel copy', () => {
    it('presents sharing and adding an expense without teaching invite-first', () => {
        expect(en.room.expenses).toMatchObject({
            emptyTitle: 'Room ready',
            emptyShare: 'Share room',
            emptyAdd: 'Add expense',
        })
    })

    it('keeps the action keys available in every locale', () => {
        for (const messages of [es419, ptBr]) {
            expect(messages.room.expenses.emptyShare).toBeTruthy()
            expect(messages.room.expenses.emptyAdd).toBeTruthy()
        }
    })
})
