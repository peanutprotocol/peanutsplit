/** Route-handler plumbing: one error envelope, one BigInt-safe serializer. */
import { ZodError } from 'zod'

export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string
    ) {
        super(message)
    }
}

/**
 * `message` is English forever — it is for logs and for `curl`. `code` is the contract: the
 * client looks it up in `errors.<CODE>` to render a translated sentence, so two failures a user
 * would describe differently must not share one code. The default is the catch-all for schema
 * rejections, not a licence to leave a distinct failure unnamed.
 */
export const badRequest = (message: string, code = 'VALIDATION_ERROR') => new ApiError(400, code, message)
export const notFound = (message: string, code = 'NOT_FOUND') => new ApiError(404, code, message)
export const conflict = (message: string, code = 'CONFLICT') => new ApiError(409, code, message)

/** BigInt has no JSON representation — every amount goes out as a string. */
const replacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data, replacer), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    })
}

export const errorResponse = (code: string, message: string, status: number) =>
    json({ error: { code, message } }, status)

/**
 * Any thrown thing → the house envelope. Split out of `respond` because one
 * route cannot use `respond` at all: the event stream's success value is a live
 * `Response`, not something to JSON-encode, so its pre-stream half calls this
 * directly rather than inventing a second error shape.
 */
export function errorEnvelope(err: unknown): Response {
    if (err instanceof ApiError) return errorResponse(err.code, err.message, err.status)
    if (err instanceof ZodError) {
        const first = err.issues[0]
        const path = first?.path.join('.')
        return errorResponse('VALIDATION_ERROR', path ? `${path}: ${first.message}` : first.message, 400)
    }
    // Name and a bounded message, never the object. A thrown Prisma validation
    // error serialises its whole argument payload — for the import route that is
    // every description and every member name in somebody's group history, on
    // its way into the container's logs.
    console.error(
        '[split] unhandled route error',
        err instanceof Error ? `${err.name}: ${err.message.slice(0, 200)}` : 'unknown'
    )
    return errorResponse('INTERNAL', 'something went wrong on our side', 500)
}

/** Wraps a handler so every failure leaves as `{ error: { code, message } }`. */
export async function respond(run: () => Promise<unknown>, successStatus = 200): Promise<Response> {
    try {
        return json(await run(), successStatus)
    } catch (err) {
        return errorEnvelope(err)
    }
}

const malformedJson = () => badRequest('request body must be JSON', 'MALFORMED_JSON')

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text)
    } catch {
        throw malformedJson()
    }
}

/** A generous ceiling for the small JSON commands used by ordinary routes. */
export const DEFAULT_JSON_BODY_BYTES = 64 * 1024

/** Body parsing that is bounded by default and fails in the house error shape. */
export async function readJson(request: Request): Promise<unknown> {
    return readJsonCapped(
        request,
        DEFAULT_JSON_BODY_BYTES,
        new ApiError(413, 'REQUEST_TOO_LARGE', 'request body is too large')
    )
}

/**
 * `readJson`, but the body cannot exceed `maxBytes`.
 *
 * WHY THIS IS NOT A `content-length` CHECK. A declared length is a claim, and it
 * is optional: `Transfer-Encoding: chunked` carries no `content-length` at all,
 * so a header check reads the missing value as 0 and waves through a body of any
 * size. Next route handlers have no default body ceiling and the container has
 * ~512MB, which is the whole exposure. So the bytes are counted as they arrive
 * and the read is abandoned the moment the count passes the cap — that is the
 * only version that actually refuses before buffering.
 *
 * The header is still checked first, and only as a fast path: an honest client
 * that declares an oversized body is refused without a single byte being read.
 *
 * `tooBig` is the caller's error because the two callers disagree about what
 * this failure IS — an import that is too big is a 400 about the file, an image
 * that is too big is a 413 about the request.
 */
export async function readJsonCapped(request: Request, maxBytes: number, tooBig: ApiError): Promise<unknown> {
    const declared = Number(request.headers.get('content-length') ?? 0)
    if (Number.isFinite(declared) && declared > maxBytes) throw tooBig

    const body = request.body
    if (!body) throw malformedJson()

    const reader = body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    let seen = 0
    try {
        for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            seen += value.byteLength
            if (seen > maxBytes) throw tooBig
            text += decoder.decode(value, { stream: true })
        }
    } finally {
        // Hangs up on the sender rather than draining the rest of a body we have
        // already refused.
        await reader.cancel().catch(() => {})
    }
    text += decoder.decode()

    return parseJson(text)
}

/** Attribution only — never authorization. The slug is the credential. */
export const memberTokenOf = (request: Request): string | null => request.headers.get('x-member-token')
