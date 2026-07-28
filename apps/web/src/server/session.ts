/**
 * The session is a sealed cookie and nothing else — no session table, no server
 * store to expire, no second round trip on every request. The cookie holds an
 * encrypted JWT (dir + A256GCM) whose entire payload is a user id, so a stolen
 * cookie reveals nothing offline and a forged one cannot be produced at all.
 *
 * Handlers here take a `Request` and stamp a `Response` rather than reaching for
 * `next/headers`. Two reasons: the route handlers in this app are plain
 * functions of a request (which is what makes them testable without a server),
 * and cookie mutation through `cookies()` is only legal in a narrow set of Next
 * contexts — a rule that is easy to break and fails at runtime, not at build.
 */
import { createHash } from 'node:crypto'
import { EncryptJWT, jwtDecrypt } from 'jose'
import { authSecret } from '@/server/authTokens'
import { ApiError, respond } from '@/server/http'
import { prisma } from '@/server/db'

const COOKIE_NAME = 'ps-session'

/**
 * Ten years, stated explicitly. An omitted `Max-Age` is not "a long time" — it
 * is a browser-session cookie, and iOS drops those every time it evicts the
 * pinned PWA from memory. That reads to the user as "it logged me out again",
 * which is the exact failure accounts exist to remove.
 */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 10

/** Refreshing `lastSeenAt` on every authenticated call would be a write per
 *  request for a field nobody reads to the minute. */
const LAST_SEEN_STALE_MS = 60 * 60 * 1000

export interface Session {
    userId: string
}

/**
 * Domain separation: the same secret signs magic links and seals sessions, so
 * each derives its own key. Sharing the raw bytes across two primitives is the
 * kind of shortcut that is fine until one of them changes.
 */
const sessionKey = (): Uint8Array => new Uint8Array(createHash('sha256').update(`${authSecret()}:session`).digest())

async function seal(userId: string): Promise<string> {
    return await new EncryptJWT({ userId })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuedAt()
        .encrypt(sessionKey())
}

async function unseal(value: string): Promise<Session | null> {
    try {
        const { payload } = await jwtDecrypt(value, sessionKey())
        const userId = payload.userId
        return typeof userId === 'string' && userId.length > 0 ? { userId } : null
    } catch {
        // Rotated secret, truncated cookie, someone poking at it — all the same
        // answer: you are not signed in.
        return null
    }
}

const cookieAttributes = (maxAge: number): string => {
    const parts = [`Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=${maxAge}`]
    // Secure would make the cookie unsettable over plain http, which is what
    // `next dev` serves. Production is https-only, so the flag is unconditional
    // there.
    if (process.env.NODE_ENV === 'production') parts.push('Secure')
    return parts.join('; ')
}

/** The one place a session is minted. Every login path goes through here so
 *  there is a single answer to "how long does a session last". */
export async function setSessionForUser(userId: string, response: Response): Promise<Response> {
    response.headers.append(
        'Set-Cookie',
        `${COOKIE_NAME}=${await seal(userId)}; ${cookieAttributes(COOKIE_MAX_AGE_SECONDS)}`
    )
    return response
}

export const clearedSessionCookie = (): string => `${COOKIE_NAME}=; ${cookieAttributes(0)}`

export function clearSession(response: Response): Response {
    response.headers.append('Set-Cookie', clearedSessionCookie())
    return response
}

const readCookie = (request: Request, name: string): string | null => {
    const header = request.headers.get('cookie')
    if (!header) return null
    for (const chunk of header.split(';')) {
        const separator = chunk.indexOf('=')
        if (separator === -1) continue
        if (chunk.slice(0, separator).trim() !== name) continue
        return decodeURIComponent(chunk.slice(separator + 1).trim())
    }
    return null
}

/** What the cookie claims, with no database involved. */
export async function readSession(request: Request): Promise<Session | null> {
    const raw = readCookie(request, COOKIE_NAME)
    return raw ? await unseal(raw) : null
}

class StaleSessionError extends ApiError {
    constructor() {
        super(401, 'SESSION_EXPIRED', 'sign in again to see your rooms')
    }
}

/**
 * The session plus the proof that its user still exists. The check is a real
 * query every time and is never cached: a cookie outliving its row is exactly
 * what deletion produces, and without this it surfaces downstream as a foreign
 * key error with no useful message attached.
 */
export async function requireUserId(request: Request): Promise<string> {
    const session = await readSession(request)
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'sign in to see your rooms')

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { id: true, lastSeenAt: true },
    })
    if (!user) throw new StaleSessionError()

    if (Date.now() - user.lastSeenAt.getTime() > LAST_SEEN_STALE_MS) {
        await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
    }
    return user.id
}

/**
 * `respond()` for authenticated routes. Identical envelope, with one addition:
 * a session whose user is gone leaves as a 401 that also unsets the cookie, so
 * the browser stops presenting a credential that can never work again.
 */
export async function respondAuthed(
    request: Request,
    run: (userId: string) => Promise<unknown>,
    successStatus = 200
): Promise<Response> {
    let stale = false
    const response = await respond(async () => {
        try {
            return await run(await requireUserId(request))
        } catch (err) {
            if (err instanceof StaleSessionError) stale = true
            throw err
        }
    }, successStatus)
    if (stale) response.headers.append('Set-Cookie', clearedSessionCookie())
    return response
}
