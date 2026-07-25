import { json } from '@/server/http'
import { publicCurrencies } from '@/server/money'

/** Static catalog — no DB, safe to cache hard. */
export const GET = () =>
    json({ currencies: publicCurrencies() }, 200, { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' })
