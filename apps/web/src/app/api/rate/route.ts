import { getRate } from '@/server/fx'
import { respond } from '@/server/http'
import { rateQuerySchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

/**
 * Indicative only — every surface that shows a rate must label it as such.
 *
 * A pair with no rate is a 200 with `rate: null`, not a 4xx. This is a preview query the client
 * runs with `retry: false`, so an error status turns "we cannot price this pair" — an ordinary
 * answer now that made-up tickers exist — into a failure state that looks like a bug.
 */
export const GET = (request: Request) =>
    respond(async () => {
        const url = new URL(request.url)
        const { from, to } = rateQuerySchema.parse({
            from: url.searchParams.get('from') ?? '',
            to: url.searchParams.get('to') ?? '',
        })
        const { rate, source } = await getRate(from, to)
        return { from, to, rate, source, indicative: true }
    })
