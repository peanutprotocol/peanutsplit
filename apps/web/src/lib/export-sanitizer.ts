export const ROOM_CAPABILITY_REDACTION = '[REDACTED_ROOM_CAPABILITY]' as const

/**
 * Export payloads can contain extensible audit objects and user-authored text.
 * Treat credential-looking fields as unsafe by name, while retaining harmless
 * security facts such as `tokenRotated: true`.
 */
const CREDENTIAL_FIELD_NAMES = new Set([
    'slug',
    'roomslug',
    'capability',
    'roomcapability',
    'token',
    'tokens',
    'membertoken',
    'accesstoken',
    'refreshtoken',
    'idtoken',
    'authtoken',
    'secrettoken',
    'secret',
    'secrets',
    'clientsecret',
    'apikey',
    'privatekey',
    'authorization',
    'auth',
    'cookie',
    'cookies',
    'credential',
    'credentials',
    'password',
    'passcode',
    'keys',
    'p256dh',
    'endpoint',
    'useragent',
    'actordevicehash',
    'devicehash',
    'analyticskey',
    'bearer',
])
const CREDENTIAL_FIELD_FRAGMENT =
    /(slug|token|secret|password|passcode|credential|authorization|cookie|privatekey|apikey|analyticskey|endpoint|devicehash|useragent|p256dh)/
const SAFE_SECURITY_METADATA_FIELDS = new Set(['tokenrotated'])

const decodePercentEncoding = (value: string): string => {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

const normalizedFieldName = (key: string): string =>
    decodePercentEncoding(key)
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')

export const credentialExportField = (key: string): boolean => {
    const normalized = normalizedFieldName(key)
    return (
        !SAFE_SECURITY_METADATA_FIELDS.has(normalized) &&
        (CREDENTIAL_FIELD_NAMES.has(normalized) || CREDENTIAL_FIELD_FRAGMENT.test(normalized))
    )
}

const regexEscape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const percentEncoded = (value: string): string =>
    [...new TextEncoder().encode(value)].map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join('')

/**
 * Match every character either literally or as UTF-8 percent bytes. ASCII
 * letters include both cases' byte values, so `%41%42` is caught for `ab` as
 * well as `%61%62`. Joining per-character alternatives also catches partially
 * encoded paths such as `trip%2Dabc`.
 */
const capabilityPattern = (liveSlug: string): RegExp => {
    const source = Array.from(liveSlug, (character) => {
        const encoded = [...new Set([character, character.toLowerCase(), character.toUpperCase()].map(percentEncoded))]
        return `(?:${[regexEscape(character), ...encoded.map(regexEscape)].join('|')})`
    }).join('')
    return new RegExp(source, 'giu')
}

const capabilityRedactor = (liveSlug: string): ((value: string) => string) => {
    if (!liveSlug) return (value) => value
    const pattern = capabilityPattern(liveSlug)
    return (value) => value.replace(pattern, ROOM_CAPABILITY_REDACTION)
}

/** Replace the live bearer value wherever it is embedded in free text, URLs or keys. */
export function redactRoomCapability(value: string, liveSlug: string): string {
    return capabilityRedactor(liveSlug)(value)
}

/**
 * Recursively prepare arbitrary JSON-shaped data for a durable export.
 * Credential fields are removed. Capability-bearing keys are retained under a
 * redacted key so a safe audit fact is not silently discarded.
 */
export function sanitizeExportValue(value: unknown, liveSlug: string): unknown {
    const redact = capabilityRedactor(liveSlug)
    const visit = (item: unknown): unknown => {
        if (typeof item === 'string') return redact(item)
        if (Array.isArray(item)) return item.map(visit)
        if (item === null || typeof item !== 'object') return item

        const entries: [string, unknown][] = []
        for (const [key, child] of Object.entries(item)) {
            const safeKey = redact(key)
            if (credentialExportField(safeKey)) continue
            entries.push([safeKey, visit(child)])
        }

        // Object.fromEntries creates a data property for hostile keys such as
        // `__proto__`; assigning those keys onto `{}` would mutate its prototype.
        return Object.fromEntries(entries)
    }
    return visit(value)
}
