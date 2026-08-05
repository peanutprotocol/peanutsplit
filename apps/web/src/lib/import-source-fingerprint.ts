import type { ImportChoice, ParsedImportFile } from '@/lib/splitpro-import'

const FINGERPRINT_DOMAIN = 'peanut-split/import-source/v1'

const sha256 = async (value: Uint8Array<ArrayBuffer>): Promise<string> => {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', value)
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export interface FingerprintedImportChoice extends ImportChoice {
    /** SHA-256 identity of the immutable upload plus this choice's source locator. */
    sourceFingerprint: string
}

export interface FingerprintedImportFile extends Omit<ParsedImportFile, 'choices'> {
    choices: FingerprintedImportChoice[]
}

/**
 * Attach durable identities without hashing the parser's projection.
 *
 * The first digest covers the exact decoded file text. The second scopes it to
 * a raw-file choice, because one Split Pro account backup can offer several
 * rooms. Parsed names, dates, split labels, and amounts are deliberately absent:
 * improving any of those later must not turn a retry of the same export into a
 * second ledger write.
 */
export async function fingerprintParsedImportFile(
    sourceText: string,
    parsed: ParsedImportFile
): Promise<FingerprintedImportFile> {
    const encoder = new TextEncoder()
    const fileDigest = await sha256(encoder.encode(sourceText))
    const choices = await Promise.all(
        parsed.choices.map(async (choice) => ({
            ...choice,
            sourceFingerprint: await sha256(
                encoder.encode(`${FINGERPRINT_DOMAIN}\0${fileDigest}\0${choice.sourceKey}`)
            ),
        }))
    )
    return { ...parsed, choices }
}
