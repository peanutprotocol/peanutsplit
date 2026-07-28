import { isDoodleName, type DoodleName } from '@/components/ui/doodles'

/**
 * Which currencies have a drawn sign.
 *
 * Keyed by CODE, not by symbol string, on purpose. Half the world's currencies print `$`, and a
 * symbol-keyed map would silently hand the US dollar's sign to the Mexican peso — the exact
 * confusion the picker exists to prevent. The map only claims a drawing where the sign really is
 * that currency's sign.
 *
 * Anything absent falls back to the typographic symbol from the catalog. That fallback is not a
 * gap to be filled in later: a hand-drawn near-miss of a sign somebody reads every day is worse
 * than the real character, so a currency only joins this list once its drawing has been judged
 * at 24px.
 */
const DOODLE_BY_CURRENCY: Record<string, string> = {
    USD: 'dollar',
    CAD: 'dollar',
    AUD: 'dollar',
    NZD: 'dollar',
    SGD: 'dollar',
    HKD: 'dollar',
    EUR: 'euro',
    GBP: 'pound',
    BRL: 'real',
    JPY: 'yen',
    CNY: 'yen',
    INR: 'rupee',
    PLN: 'zloty',
    NGN: 'naira',
    CHF: 'franc',
    THB: 'baht',
    MXN: 'peso',
    ARS: 'peso',
    COP: 'peso',
    CLP: 'peso',
    UYU: 'peso',
    PHP: 'peso',
}

/**
 * The drawn sign for a currency, or null to fall back to its typographic symbol.
 *
 * Guarded by `isDoodleName` rather than trusted: the map above is hand-written and the drawing
 * set is generated, so a renamed drawing would otherwise reach `DOODLE[name]` as undefined and
 * render an empty `<path>` — a blank square where a sign belongs, which looks like a font
 * failure and is invisible in a typecheck.
 */
export function currencyDoodle(code: string): DoodleName | null {
    const name = DOODLE_BY_CURRENCY[code.toUpperCase()]
    return name && isDoodleName(name) ? name : null
}
