/**
 * The receipt-scan endpoint, and THE capability probe for every model feature.
 *
 * GET answers `{ enabled }`. It exists because the thing being gated is a
 * *server* capability — an API key that lives in the container — and the usual
 * `NEXT_PUBLIC_` flag is the wrong instrument for that: it is baked at build
 * time, so setting the key would not reveal the feature and unsetting it would
 * not hide it. One cheap, cacheable GET tells the client the truth as of now.
 * The `:slug` in the GET's path is DECORATIVE — the answer is process-wide and
 * the param is not read — and it stays only so the probe and the POST share one
 * URL. The client caches it once, not once per room.
 *
 * POST takes one image and returns line items. It writes nothing — no row, no
 * file, and no image anywhere. The scan produces a *draft* the user reviews and
 * then saves through the ordinary expense endpoint, which is why this route is
 * not on the money path despite being about money.
 */

import { ApiError, badRequest, json, readJsonCapped, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit, meterRoomLookup, type Limit } from '@/server/rateLimit'
import { loadRoom } from '@/server/roomState'
import { modelEnabled } from '@/server/model'
import { MAX_IMAGE_BASE64_CHARS, enforceRoomScanLimit, parseReceipt } from '@/server/receipt'
import { receiptImageMatchesMimeType } from '@/server/receiptImage'
import { receiptParseSchema } from '@/server/validation'
import { splitV2Enabled } from '@/lib/flags'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

/**
 * Ten an hour per IP. Deliberately far below `WRITE_LIMIT` (120): every other
 * write costs us a row, this one costs a vision-model call, and a scan takes
 * long enough that ten in an hour is already someone doing something other than
 * splitting a dinner. Imported `WRITE_LIMIT`'s window, not its capacity.
 */
const SCAN_LIMIT: Limit = { capacity: 10, windowMs: WRITE_LIMIT.windowMs }

/** An hour of caching on a flag that only changes when someone redeploys with a
 *  different env. The client re-probes on a cold start either way. */
export const GET = () => {
    if (!splitV2Enabled()) return json({ error: { code: 'NOT_FOUND', message: 'not found' } }, 404)
    return json({ enabled: modelEnabled() }, 200, { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' })
}

export const POST = (request: Request, ctx: Ctx) =>
    respond(async () => {
        if (!splitV2Enabled()) throw new ApiError(404, 'NOT_FOUND', 'not found')
        // Before anything else, including the DB read: an unconfigured
        // deployment should cost a request no work at all.
        if (!modelEnabled()) throw new ApiError(503, 'SCAN_UNAVAILABLE', 'receipt scanning is not configured')
        enforceRateLimit(request, SCAN_LIMIT, 'scan')

        // Counted while it arrives, not taken on the sender's word: a chunked
        // request declares no length, so a `content-length` check alone reads
        // the missing header as zero and buffers a body of any size. The header
        // is still the fast path for an honest client — see `readJsonCapped`.
        // The base64 check below is the semantic gate; this one bounds memory.
        const { slug } = await ctx.params
        const raw = await readJsonCapped(request, MAX_IMAGE_BASE64_CHARS + 1024, imageTooLarge())
        const body = receiptParseSchema.parse(raw)

        if (body.imageBase64.length > MAX_IMAGE_BASE64_CHARS) throw imageTooLarge()
        // Base64 with a `data:` prefix left on is the most likely client bug,
        // and it fails inside the model rather than here unless it is named.
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.imageBase64)) {
            throw badRequest('imageBase64 must be raw base64 with no data: prefix', 'SCAN_BAD_IMAGE')
        }
        if (!receiptImageMatchesMimeType(body.imageBase64, body.mimeType)) {
            throw badRequest('image bytes do not match the declared mime type', 'SCAN_BAD_IMAGE')
        }

        // A room slug is the room credential. Share the same miss budget as
        // every other slug lookup so this route cannot become a parallel room-
        // existence oracle just because it also has a stricter model-cost cap.
        const room = await meterRoomLookup(request, () => loadRoom(slug))
        // Per-room after per-IP, and after the room is known to exist: the daily
        // allowance belongs to a real room, not to a slug someone guessed.
        enforceRoomScanLimit(room.id)

        return await parseReceipt(body, room.currency, request.signal)
    })

const imageTooLarge = () => new ApiError(413, 'SCAN_IMAGE_TOO_LARGE', 'that image is too large — take a new photo')
