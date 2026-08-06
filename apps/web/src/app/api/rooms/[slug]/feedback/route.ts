import { MAX_FEEDBACK_REQUEST_BYTES } from '@/lib/feedback-contract'
import { prisma } from '@/server/db'
import { persistFeedbackReport } from '@/server/feedback'
import { feedbackReportSchema } from '@/server/feedbackValidation'
import { ApiError, notFound, readJsonCapped, respondSensitive } from '@/server/http'
import {
    FEEDBACK_LIMIT,
    FEEDBACK_ROOM_LIMIT,
    enforceRateLimit,
    enforceRateLimitOn,
    meterRoomLookup,
} from '@/server/rateLimit'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

/**
 * Private write only. There is intentionally no GET export: holding a room link
 * must never make support reports, diagnostics or screenshots room-readable.
 */
export const POST = (request: Request, ctx: Ctx) =>
    respondSensitive(async () => {
        enforceRateLimit(request, FEEDBACK_LIMIT, 'feedback')
        const body = feedbackReportSchema.parse(
            await readJsonCapped(
                request,
                MAX_FEEDBACK_REQUEST_BYTES,
                new ApiError(413, 'REQUEST_TOO_LARGE', 'feedback report is too large')
            )
        )
        const { slug } = await ctx.params
        const room = await meterRoomLookup(request, async () => {
            const found = await prisma.room.findUnique({ where: { slug }, select: { id: true } })
            if (!found) throw notFound('room not found')
            return found
        })
        enforceRateLimitOn(room.id, FEEDBACK_ROOM_LIMIT, 'feedback-room')

        return persistFeedbackReport({
            roomId: room.id,
            roomSlug: slug,
            body,
        })
    }, 201)
