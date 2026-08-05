import { describe, expect, it } from 'vitest'
import { fingerprintParsedImportFile } from '@/lib/import-source-fingerprint'
import type { ParsedImportFile } from '@/lib/splitpro-import'

const parsedFile = (description: string): ParsedImportFile => ({
    source: 'splitwise',
    skipped: [],
    choices: [
        {
            id: 'presentation-only-id',
            sourceKey: 'file',
            roomName: 'Presentation-only room name',
            parsed: {
                members: ['You', 'Bea'],
                expenses: [
                    {
                        date: '2026-08-05',
                        description,
                        category: null,
                        currencyCode: 'EUR',
                        costMinor: '1000',
                        paidBy: 'You',
                        splitMode: 'EQUAL',
                        shares: [
                            { member: 'You', amountMinor: '500' },
                            { member: 'Bea', amountMinor: '500' },
                        ],
                    },
                ],
                suggestedCurrency: 'EUR',
                currencies: ['EUR'],
                totalBalance: null,
                warnings: [],
            },
        },
    ],
})

describe('immutable import source fingerprints', () => {
    it('does not change when a parser version projects the same file differently', async () => {
        const source = 'the exact same source export bytes after UTF-8 decoding'
        const before = await fingerprintParsedImportFile(source, parsedFile('Old parser description'))
        const after = await fingerprintParsedImportFile(source, parsedFile('Improved parser description'))

        expect(after.choices[0].sourceFingerprint).toBe(before.choices[0].sourceFingerprint)
        expect(after.choices[0].sourceFingerprint).toMatch(/^[a-f0-9]{64}$/)
    })

    it('scopes choices within one file and changes only when the immutable source changes', async () => {
        const oneChoice = parsedFile('Dinner')
        const twoChoices: ParsedImportFile = {
            ...oneChoice,
            choices: [oneChoice.choices[0], { ...oneChoice.choices[0], id: 'second label', sourceKey: 'group:1' }],
        }
        const original = await fingerprintParsedImportFile('source A', twoChoices)
        const changed = await fingerprintParsedImportFile('source B', twoChoices)

        expect(original.choices[0].sourceFingerprint).not.toBe(original.choices[1].sourceFingerprint)
        expect(changed.choices[0].sourceFingerprint).not.toBe(original.choices[0].sourceFingerprint)
    })
})
