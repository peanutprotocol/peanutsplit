import { getRate } from '@/server/fx'
import { respond } from '@/server/http'
import { rateQuerySchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

/** Indicative only — every surface that shows a rate must label it as such. */
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
