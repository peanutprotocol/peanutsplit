import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en.json'
import { KNOWN_ERROR_CODES } from './error-messages'

/**
 * The one thing the i18n audit script cannot check about this module: it maps a code to a key at
 * runtime (`t(error.code)`), so the audit sees a computed key and skips it. Catalog parity still
 * guarantees es/pt-BR match en — this closes the other half by proving en covers every code the
 * client claims to know. A gap here renders the code itself at the user.
 */
describe('error message coverage', () => {
    const messages = en.errors as Record<string, string>

    it('has an English message for every known code', () => {
        const missing = KNOWN_ERROR_CODES.filter((code) => typeof messages[code] !== 'string')
        expect(missing).toEqual([])
    })

    it('has no orphan entries left behind by a removed code', () => {
        const known = new Set<string>([...KNOWN_ERROR_CODES, 'generic'])
        expect(Object.keys(messages).filter((key) => !known.has(key))).toEqual([])
    })
})
