import { isDoodleName, type DoodleName } from '@/components/ui/doodles'
import { CATALOG_BY_CODE } from '@/lib/currency-catalog'

/**
 * Which drawing stands for which currency.
 *
 * Keyed by DRAWING, not by code, and never by symbol string. Half the world prints `$`, so a
 * symbol-keyed map would hand the US dollar's sign to the Mexican peso — the confusion the picker
 * exists to prevent. Keying by drawing is what keeps this list short enough to read: the value is
 * the set of codes that share one mark, and adding a currency to a family is one word.
 *
 * Two kinds of entry live here and the difference matters.
 *
 *   - A SIGN. The drawing is that currency's own mark: euro, won, baht, shekel.
 *   - A FAMILY MARK. The drawing is the mark a group shares, and the ISO code beside it says which
 *     member you are looking at. Nobody prints the franc sign — Switzerland writes CHF and the CFA
 *     zone writes FCFA — so `franc` has always been one of these. So are `dollar`, `pound`,
 *     `guilder` and `shilling`.
 *
 * A currency is absent when its mark is a country abbreviation nobody outside it reads, or when the
 * real character does not hold at 20px. Absent is a decision, not a gap: a hand-drawn near-miss of a
 * sign somebody reads every day is worse than no drawing, so a currency joins this list only once
 * its drawing has been judged small. The riyal family, the taka and the dirham are all out for that
 * reason.
 *
 * Some codes here are not in the catalog — JEP, GGP, IMP, KID, TVD, CNH, FOK. The rate feed carries
 * them and they do print these marks, but they are not ISO 4217 currencies. This list records what a
 * code prints; the catalog decides whether the code is a currency at all. `currencyDoodle` filters
 * one against the other, so those codes are typed as invented tickers, not as pounds and dollars.
 */
const CODES_BY_DOODLE = {
    dollar: 'AUD BBD BMD BND BSD BZD CAD CUP DOP FJD GYD HKD JMD KID KYD LRD MOP NAD NIO NZD SBD SGD SRD TOP TTD TVD TWD USD WST XCD',
    peso: 'ARS CLP COP MXN UYU',
    euro: 'EUR',
    pound: 'EGP FKP GBP GGP GIP IMP JEP LBP SHP SSP SYP',
    real: 'BRL',
    yen: 'CNH CNY JPY',
    rupee: 'INR',
    zloty: 'PLN',
    naira: 'NGN',
    franc: 'BIF CDF CHF DJF GNF KMF RWF XAF XOF XPF',
    baht: 'THB',
    won: 'KRW',
    ruble: 'RUB',
    lira: 'TRY',
    shekel: 'ILS',
    dong: 'VND',
    hryvnia: 'UAH',
    tenge: 'KZT',
    tugrik: 'MNT',
    kip: 'LAK',
    guarani: 'PYG',
    colon: 'CRC',
    cedi: 'GHS',
    piso: 'PHP',
    guilder: 'ANG AWG XCG',
    rsmark: 'LKR MUR NPR PKR SCR',
    krona: 'DKK FOK ISK NOK SEK',
    koruna: 'CZK',
    forint: 'HUF',
    rand: 'ZAR',
    rupiah: 'IDR',
    ringgit: 'MYR',
    shilling: 'KES SOS TZS UGX',
} satisfies Partial<Record<DoodleName, string>>

/**
 * Code to drawing, resolved once at module load.
 *
 * Two filters run here, and both are load-bearing. `CATALOG_BY_CODE.has` drops the codes above that
 * are not currencies, so they reach the invented-ticker branch instead of borrowing a real sign.
 * `isDoodleName` carries the compile-time key check through `Object.entries`, which widens the
 * drawing name back to `string`; without it a renamed drawing would reach `DOODLE[name]` as
 * undefined and render an empty `<path>` — a blank square where a sign belongs, which reads as a
 * broken font.
 */
const DOODLE_BY_CURRENCY: ReadonlyMap<string, DoodleName> = new Map(
    Object.entries(CODES_BY_DOODLE).flatMap(([name, codes]) =>
        isDoodleName(name)
            ? codes
                  .split(' ')
                  .filter((code) => CATALOG_BY_CODE.has(code))
                  .map((code) => [code, name] as const)
            : []
    )
)

/**
 * The drawing for a currency code. Total — every code gets one, in four steps:
 *
 *   1. the currency's own drawn sign, when it has one;
 *   2. its family mark, when the sign is shared — steps 1 and 2 are the same lookup, because the
 *      picker does not distinguish them either;
 *   3. `banknote`, when the code is a real currency this set does not draw;
 *   4. `shrug`, when the code is not a currency at all.
 *
 * Steps 3 and 4 are why this needs the catalog. A real currency nobody drew gets a banknote: it says
 * "money" and claims nothing, so it cannot be a wrong sign. An invented ticker gets the shrug,
 * because that room runs with no rate and no conversion, and the sign is the first place to say so.
 * Swapping the two would be the worst of both — an invented ticker wearing real money, and a real
 * currency being laughed at.
 *
 * This used to fall back to the typographic symbol from the catalog, and callers used the null
 * return to decide. That is gone: 61 of the 162 catalog codes have no symbol at all, so the fallback
 * ran out of characters exactly where it was needed.
 */
export function currencyDoodle(code: string): DoodleName {
    const upper = code.toUpperCase()
    const drawn = DOODLE_BY_CURRENCY.get(upper)
    if (drawn) return drawn
    return CATALOG_BY_CODE.has(upper) ? 'banknote' : 'shrug'
}
