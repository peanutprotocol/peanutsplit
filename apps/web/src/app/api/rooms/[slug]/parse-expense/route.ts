/**
 * The quick-add endpoint: one line of text in, one expense draft out.
 *
 * POST only, and that is the interesting part. There is no capability probe
 * here because there is nothing this route could answer that
 * `GET /api/rooms/:slug/receipt-parse` does not already: one key configures both
 * typing-removers, so a second probe would be a second round trip returning the
 * same boolean — and two booleans that must always agree are a bug waiting for
 * the deploy where they don't. The client asks once and hides or shows both
 * affordances on the answer.
 *
 * It writes nothing — no row, no file, and no copy of the text anywhere. The
 * draft prefills a form the user then saves through the ordinary expense
 * endpoint, which is why this route is not on the money path despite being
 * entirely about money.
 */

import { ApiError, readJsonCapped, respond } from '@/server/http'
import { modelEnabled } from '@/server/model'
import { enforceRoomNlLimit, parseNlExpense } from '@/server/nlExpense'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { loadRoom } from '@/server/roomState'
import { assertWritable } from '@/server/rooms'
import { nlParseSchema } from '@/server/validation'
import { MAX_NL_TEXT_CHARS } from '@/lib/quick-add'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

/**
 * The ordinary write allowance per IP, not the scan's tighter one. A quick add
 * costs about what an expense costs — a short prompt and a short answer — and
 * the room's daily ceiling below is what actually bounds the spend. This one is
 * here to stop a loop.
 */
const NL_LIMIT = WRITE_LIMIT

/** UTF-8 runs to four bytes a character, plus the JSON envelope. Generous by
 *  design: this bounds MEMORY, and the character ceiling below is the semantic
 *  gate. */
const MAX_BODY_BYTES = MAX_NL_TEXT_CHARS * 4 + 512

export const POST = (request: Request, ctx: Ctx) =>
    respond(async () => {
        // Before anything else, including the DB read: an unconfigured
        // deployment should cost a request no work at all.
        if (!modelEnabled()) throw new ApiError(503, 'NL_UNAVAILABLE', 'quick add is not configured')
        enforceRateLimit(request, NL_LIMIT, 'nl')

        // Counted while it arrives, not taken on the sender's word: a chunked
        // request declares no length, so a `content-length` check alone reads
        // the missing header as zero and buffers a body of any size.
        const { slug } = await ctx.params
        const raw = await readJsonCapped(request, MAX_BODY_BYTES, textTooLong())
        const body = nlParseSchema.parse(raw)
        // Its own sentence rather than the schema's generic one: somebody who
        // pasted half a chat deserves to be told that is what happened.
        if (body.text.length > MAX_NL_TEXT_CHARS) throw textTooLong()

        const room = await loadRoom(slug)
        assertWritable(room)
        // Per-room after per-IP, and after the room is known to exist: the daily
        // allowance belongs to a real room, not to a slug someone guessed.
        enforceRoomNlLimit(room.id)

        return await parseNlExpense(body, {
            members: room.members,
            // UTC, because a room has no timezone and never will — the cost of
            // being wrong is an expense dated a day off in the hours around
            // midnight, on a field the form shows and the user can change.
            today: new Date().toISOString().slice(0, 10),
        })
    })

const textTooLong = () =>
    new ApiError(413, 'NL_TEXT_TOO_LONG', 'that is more text than one expense — trim it down and try again')
