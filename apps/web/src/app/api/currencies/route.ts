import type { CurrencyInfo } from '@/lib/api-types'
import { json } from '@/server/http'
import { publicCurrencies, STATIC_USD_PER_UNIT } from '@/server/money'

/**
 * Static catalog — no DB, safe to cache hard.
 *
 * `hasRate` says the rate feed carries the code, which is a fact about the generated catalog and
 * moves only with a deploy. Reading it off the live rate table instead would put a database round
 * trip, and in the worst case a four-second upstream call, in front of the landing page's first
 * paint — `useCurrencies()` runs there.
 *
 * One exception, and it is the whole reason this route is not a one-liner. `SPLIT_FX_MODE=static`
 * turns the rate feed off — that is dev, the unit suite and the e2e run — and the static table
 * prices twelve codes, not 158. Serving the catalog's own `hasRate` there offers the picker
 * currencies the server then refuses at write time with a 400 `NO_RATE`, which reads as a broken
 * app in exactly the environments where the app is being worked on. So static mode advertises what
 * static mode can price, and nothing else.
 */
const advertised = (): readonly CurrencyInfo[] => {
    const catalog = publicCurrencies()
    if (process.env.SPLIT_FX_MODE !== 'static') return catalog
    return catalog.map((c) => ({ ...c, hasRate: c.hasRate && Object.hasOwn(STATIC_USD_PER_UNIT, c.code) }))
}

export const GET = () =>
    json({ currencies: advertised() }, 200, { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' })
