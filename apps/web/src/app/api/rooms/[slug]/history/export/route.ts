import { roomHistoryExportBySlug } from '@/server/history-export'
import { errorEnvelope, PRIVATE_JSON_CACHE_CONTROL } from '@/server/http'
import { meterRoomLookup } from '@/server/rateLimit'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export const GET = async (request: Request, ctx: Ctx): Promise<Response> => {
    try {
        const { slug } = await ctx.params
        const file = await meterRoomLookup(request, () => roomHistoryExportBySlug(slug))
        return new Response(file.body, {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Disposition': `attachment; filename="${file.filename}"`,
                'Cache-Control': PRIVATE_JSON_CACHE_CONTROL,
                'X-Content-Type-Options': 'nosniff',
            },
        })
    } catch (error) {
        return errorEnvelope(error)
    }
}
