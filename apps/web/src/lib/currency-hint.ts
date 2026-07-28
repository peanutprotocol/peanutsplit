/**
 * Guessing the room's currency from the device, offline.
 *
 * The deploy has no egress, so IP geolocation is not an option — and it turns out not to be
 * needed. A phone already carries two independent signals about where its owner is and who they
 * are, and between them they cover the cases that matter:
 *
 * - **`Intl.DateTimeFormat().resolvedOptions().timeZone` says where you ARE.** It is set by the
 *   OS from the network/location and follows you across a border. This is the stronger signal
 *   for splitting a bill, because a bill is paid where you are standing.
 * - **`navigator.languages` says who you ARE.** It is stable across borders and is what breaks a
 *   tie, covers a timezone nobody mapped, and survives a device that reports UTC.
 *
 * So: **timezone first, language after.** A Brazilian in Lisbon (`Europe/Lisbon` + `pt-BR`) is
 * splitting dinner in euros, not reais — but reais stay on the list as the second guess, because
 * they might be settling up about the flight home. That is exactly why this returns a *ranked
 * list* rather than one answer: a guess presented as a fact is worse than no guess, and three
 * one-tap chips cost the user nothing.
 *
 * Everything is table-driven from `ORIGINS` below, which covers only the 12 catalog currencies
 * (`src/server/money.ts`). Anything outside it resolves to EUR (the `Europe/` catch-all) or USD
 * (the final fallback) rather than to a currency the room could not be created in.
 *
 * This module is pure on purpose — no `navigator`, no `Intl`, no React. The device reading lives
 * in `use-currency-hint.ts`, which keeps this testable with explicit fixtures.
 */

/** Why a currency is being suggested. Ordered: `timezone` outranks `language`. */
export type CurrencyHintReason = 'timezone' | 'language' | 'default'

export interface CurrencyCandidate {
    currency: string
    reason: CurrencyHintReason
}

export interface CurrencySignals {
    /** IANA zone name, e.g. `America/Sao_Paulo`. */
    timeZone?: string | null
    /** `navigator.languages`, most-preferred first. */
    languages?: readonly string[] | null
}

/** Three chips is the most a 390px screen holds without becoming a second picker. */
export const MAX_CURRENCY_HINTS = 3

/** Where the world lands when nothing else matches. */
export const DEFAULT_HINT_CURRENCY = 'USD'

interface CurrencyOrigin {
    code: string
    /** Rendered in chips and picker rows. EUR gets the union flag — there is no euro country. */
    flag: string
    /** ISO-3166-1 alpha-2 regions whose language tags point here (`es-AR` → `AR`). */
    regions: readonly string[]
    /** Language subtags that point here with no region at all (`ja`, `th`). */
    languages?: readonly string[]
    /** Exact IANA zone names, including the legacy aliases devices still report. */
    zones?: readonly string[]
    /** IANA prefixes. Longest prefix wins, and any exact `zones` entry beats every prefix. */
    zonePrefixes?: readonly string[]
}

/**
 * One table, three lookups. Adding a 13th currency to the catalog means adding one row here and
 * nothing else — the maps below are all derived.
 */
const ORIGINS: readonly CurrencyOrigin[] = [
    {
        code: 'USD',
        flag: '🇺🇸',
        regions: ['US'],
        zones: [
            'America/New_York',
            'America/Chicago',
            'America/Denver',
            'America/Los_Angeles',
            'America/Phoenix',
            'America/Anchorage',
            'America/Adak',
            'America/Detroit',
            'America/Boise',
            'America/Juneau',
            'America/Sitka',
            'America/Nome',
            'America/Yakutat',
            'America/Menominee',
            'Pacific/Honolulu',
        ],
        zonePrefixes: ['America/Indiana/', 'America/Kentucky/', 'America/North_Dakota/', 'US/'],
    },
    {
        code: 'EUR',
        flag: '🇪🇺',
        // The eurozone, not the EU: a Swedish or Polish tag has no euro to fall back to, so it
        // drops through to the default rather than proposing a currency they do not spend.
        regions: [
            'AT',
            'BE',
            'HR',
            'CY',
            'EE',
            'FI',
            'FR',
            'DE',
            'GR',
            'IE',
            'IT',
            'LV',
            'LT',
            'LU',
            'MT',
            'NL',
            'PT',
            'SK',
            'SI',
            'ES',
        ],
        // `Europe/` as a catch-all is deliberately generous. Europe/Istanbul or Europe/Warsaw
        // proposing euros is a wrong guess the user overrides in one tap; proposing dollars to
        // someone standing in Europe is a wronger one.
        zonePrefixes: ['Europe/'],
    },
    { code: 'GBP', flag: '🇬🇧', regions: ['GB', 'UK'], zones: ['Europe/London', 'Europe/Belfast', 'GB'] },
    {
        code: 'ARS',
        flag: '🇦🇷',
        regions: ['AR'],
        zones: [
            'America/Buenos_Aires',
            'America/Catamarca',
            'America/Cordoba',
            'America/Jujuy',
            'America/Mendoza',
            'America/Rosario',
        ],
        zonePrefixes: ['America/Argentina/'],
    },
    {
        code: 'BRL',
        flag: '🇧🇷',
        regions: ['BR'],
        zones: [
            'America/Sao_Paulo',
            'America/Bahia',
            'America/Fortaleza',
            'America/Recife',
            'America/Maceio',
            'America/Belem',
            'America/Santarem',
            'America/Araguaina',
            'America/Manaus',
            'America/Boa_Vista',
            'America/Porto_Velho',
            'America/Cuiaba',
            'America/Campo_Grande',
            'America/Rio_Branco',
            'America/Eirunepe',
            'America/Noronha',
        ],
        zonePrefixes: ['Brazil/'],
    },
    {
        code: 'MXN',
        flag: '🇲🇽',
        regions: ['MX'],
        zones: [
            'America/Mexico_City',
            'America/Cancun',
            'America/Merida',
            'America/Monterrey',
            'America/Matamoros',
            'America/Mazatlan',
            'America/Chihuahua',
            'America/Ojinaga',
            'America/Hermosillo',
            'America/Tijuana',
            'America/Bahia_Banderas',
        ],
        zonePrefixes: ['Mexico/'],
    },
    { code: 'COP', flag: '🇨🇴', regions: ['CO'], zones: ['America/Bogota'] },
    { code: 'CHF', flag: '🇨🇭', regions: ['CH', 'LI'], zones: ['Europe/Zurich', 'Europe/Vaduz'] },
    { code: 'THB', flag: '🇹🇭', regions: ['TH'], languages: ['th'], zones: ['Asia/Bangkok'] },
    { code: 'JPY', flag: '🇯🇵', regions: ['JP'], languages: ['ja'], zones: ['Asia/Tokyo'] },
    { code: 'AUD', flag: '🇦🇺', regions: ['AU'], zonePrefixes: ['Australia/'] },
    {
        code: 'CAD',
        flag: '🇨🇦',
        regions: ['CA'],
        zones: [
            'America/Toronto',
            'America/Montreal',
            'America/Vancouver',
            'America/Edmonton',
            'America/Winnipeg',
            'America/Halifax',
            'America/Moncton',
            'America/St_Johns',
            'America/Goose_Bay',
            'America/Glace_Bay',
            'America/Regina',
            'America/Swift_Current',
            'America/Whitehorse',
            'America/Dawson',
            'America/Dawson_Creek',
            'America/Fort_Nelson',
            'America/Inuvik',
            'America/Yellowknife',
            'America/Iqaluit',
            'America/Pangnirtung',
            'America/Rankin_Inlet',
            'America/Resolute',
            'America/Cambridge_Bay',
            'America/Creston',
            'America/Atikokan',
            'America/Blanc-Sablon',
            'America/Nipigon',
            'America/Rainy_River',
            'America/Thunder_Bay',
        ],
        zonePrefixes: ['Canada/'],
    },
]

const FLAG_BY_CODE = new Map(ORIGINS.map((origin) => [origin.code, origin.flag]))

const CURRENCY_BY_REGION = new Map<string, string>()
const CURRENCY_BY_LANGUAGE = new Map<string, string>()
const CURRENCY_BY_ZONE = new Map<string, string>()
const ZONE_PREFIXES: { prefix: string; code: string }[] = []

for (const origin of ORIGINS) {
    for (const region of origin.regions) CURRENCY_BY_REGION.set(region, origin.code)
    for (const language of origin.languages ?? []) CURRENCY_BY_LANGUAGE.set(language, origin.code)
    for (const zone of origin.zones ?? []) CURRENCY_BY_ZONE.set(zone, origin.code)
    for (const prefix of origin.zonePrefixes ?? []) ZONE_PREFIXES.push({ prefix, code: origin.code })
}

// Longest first, so `America/Argentina/` is consulted before a hypothetical `America/`.
ZONE_PREFIXES.sort((a, b) => b.prefix.length - a.prefix.length)

/** The flag for a currency, or '' for anything outside the catalog — never a placeholder box. */
export const currencyFlag = (code: string): string => FLAG_BY_CODE.get(code.toUpperCase()) ?? ''

/**
 * `es-419` → `419`, `zh-Hans-CN` → `CN`, `pt` → null. The region is the first subtag after the
 * language that is two letters or three digits; a four-letter subtag is a script and is skipped.
 */
export function regionFromLanguageTag(tag: string): string | null {
    const subtags = tag.trim().split(/[-_]/).slice(1)
    for (const subtag of subtags) {
        if (/^[A-Za-z]{2}$/.test(subtag)) return subtag.toUpperCase()
        if (/^\d{3}$/.test(subtag)) return subtag
    }
    return null
}

/**
 * A single language tag → currency. The region wins (`fr-CA` is Canadian, not French); a bare
 * language only resolves where the language is effectively one country in this catalog (`ja`,
 * `th`). `es`, `pt`, `en` and `de` alone stay unresolved on purpose — guessing between ARS, MXN
 * and COP from `es` is a coin flip dressed up as intelligence.
 */
export function currencyForLanguage(tag: string): string | null {
    const region = regionFromLanguageTag(tag)
    if (region) {
        const byRegion = CURRENCY_BY_REGION.get(region)
        if (byRegion) return byRegion
    }
    const primary = tag.trim().split(/[-_]/)[0]?.toLowerCase() ?? ''
    return CURRENCY_BY_LANGUAGE.get(primary) ?? null
}

/** An IANA zone name → currency. Exact name first, then the longest matching prefix. */
export function currencyForTimeZone(timeZone: string): string | null {
    const zone = timeZone.trim()
    if (zone.length === 0) return null
    const exact = CURRENCY_BY_ZONE.get(zone)
    if (exact) return exact
    for (const { prefix, code } of ZONE_PREFIXES) {
        if (zone.startsWith(prefix)) return code
    }
    return null
}

/**
 * The ranked guess, deduped, at most `MAX_CURRENCY_HINTS` long.
 *
 * Timezone leads because it answers "where is this bill being paid". Languages follow in the
 * order the browser ranked them, which is the order the user chose. The USD default is appended
 * only when nothing at all resolved — padding a real guess out to three with filler would make
 * the third chip a lie.
 */
export function rankCurrencyCandidates(signals: CurrencySignals): CurrencyCandidate[] {
    const ranked: CurrencyCandidate[] = []
    const seen = new Set<string>()

    const push = (currency: string | null, reason: CurrencyHintReason) => {
        if (!currency || seen.has(currency)) return
        seen.add(currency)
        ranked.push({ currency, reason })
    }

    push(currencyForTimeZone(signals.timeZone ?? ''), 'timezone')
    for (const tag of signals.languages ?? []) push(currencyForLanguage(tag), 'language')

    if (ranked.length === 0) push(DEFAULT_HINT_CURRENCY, 'default')

    return ranked.slice(0, MAX_CURRENCY_HINTS)
}
