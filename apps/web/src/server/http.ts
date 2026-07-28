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

/** Wraps a handler so every failure leaves as `{ error: { code, message } }`. */
export async function respond(run: () => Promise<unknown>, successStatus = 200): Promise<Response> {
    try {
        return json(await run(), successStatus)
    } catch (err) {
        if (err instanceof ApiError) return errorResponse(err.code, err.message, err.status)
        if (err instanceof ZodError) {
            const first = err.issues[0]
            const path = first?.path.join('.')
            return errorResponse('VALIDATION_ERROR', path ? `${path}: ${first.message}` : first.message, 400)
        }
        console.error('[split] unhandled route error', err)
        return errorResponse('INTERNAL', 'something went wrong on our side', 500)
    }
}

/** Body parsing that fails as a 400, not a 500. */
export async function readJson(request: Request): Promise<unknown> {
    try {
        return await request.json()
    } catch {
        throw badRequest('request body must be JSON', 'MALFORMED_JSON')
    }
}

/** Attribution only — never authorization. The slug is the credential. */
export const memberTokenOf = (request: Request): string | null => request.headers.get('x-member-token')
