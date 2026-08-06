const MARK = /\p{Mark}/u
const DISRUPTIVE_FORMAT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu
const MAX_CONSECUTIVE_MARKS = 3

/**
 * Preserve real-world scripts and accents while bounding the combining-mark
 * stacks that can paint across several unrelated rows. NFC composes ordinary
 * accents first; the remaining cap is deliberately per base character so
 * Arabic, Indic and Vietnamese names keep their meaningful marks.
 */
export function normalizePersonName(value: string): string {
    const normalized = value.normalize('NFC').replace(DISRUPTIVE_FORMAT, ' ')
    let markRun = 0
    let bounded = ''

    for (const character of normalized) {
        if (MARK.test(character)) {
            markRun += 1
            if (markRun > MAX_CONSECUTIVE_MARKS) continue
        } else {
            markRun = 0
        }
        bounded += character
    }

    return bounded.replace(/\s+/gu, ' ').trim()
}

/** Legacy rooms can contain names written before validation was hardened. */
export function safePersonNameForDisplay(value: string): string {
    return normalizePersonName(value) || '—'
}
