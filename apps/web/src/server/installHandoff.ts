/**
 * One explicit iOS install intent, bridged through the only browser state
 * WebKit copies into a new Home Screen container: cookies.
 *
 * The secret cookie is random and opaque. Only a domain-separated SHA-256
 * digest is durable, and one row points to one room plus an optional member
 * proven at preparation time. There is deliberately no device or user key:
 * this must not grow into a cross-room anonymous account by accident.
 */
import { createHash, randomBytes } from 'node:crypto'
import { siteUrl } from '@/lib/site'
import { prisma } from '@/server/db'
import { ApiError, badRequest, readJson } from '@/server/http'

export const INSTALL_HANDOFF_COOKIE = '__Host-ps-install-handoff'
export const INSTALL_HANDOFF_READY_COOKIE = '__Host-ps-install-handoff-ready'
export const INSTALL_HANDOFF_TTL_SECONDS = 24 * 60 * 60
/** Enough for a large group to install concurrently, while one leaked room link
 *  can never grow this transient table without bound by omitting its old cookie. */
export const MAX_OUTSTANDING_INSTALL_HANDOFFS_PER_ROOM = 32

const TOKEN_BYTES = 32
const TOKEN_LENGTH = 43
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export interface InstallHandoffPayload {
    room: {
        slug: string
        name: string
        emoji: string | null
        theme: string | null
    }
    identity: {
        memberId: string
        name: string
        token: string
    } | null
}

const unavailable = () => new ApiError(404, 'INSTALL_HANDOFF_UNAVAILABLE', 'this install handoff is unavailable')

/** The build-time product origin is authoritative. A renderer address or request Host must not
 * redefine which site may prepare or redeem a handoff. */
const expectedOrigin = (): string => siteUrl

/** Prevent another site from planting its room as the one a victim's new app
 * opens. Every browser caller supplies Origin for these non-simple mutations. */
export function assertInstallHandoffSameOrigin(request: Request): void {
    const supplied = request.headers.get('origin')
    let origin: string | null = null
    try {
        origin = supplied ? new URL(supplied).origin : null
    } catch {
        origin = null
    }
    if (origin !== expectedOrigin()) {
        throw new ApiError(403, 'CROSS_SITE_REQUEST', 'install handoff requests must come from this site')
    }
}

/** POSTs intentionally require an exact empty JSON command. Besides keeping the
 * wire contract narrow, application/json makes an HTML form unable to issue the
 * request without a CORS preflight. */
export async function readEmptyInstallHandoffCommand(request: Request): Promise<void> {
    const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (mediaType !== 'application/json') {
        throw new ApiError(415, 'JSON_REQUIRED', 'install handoff requests must be JSON')
    }
    const body = await readJson(request)
    if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length !== 0) {
        throw badRequest('request body must be an empty object', 'VALIDATION_ERROR')
    }
}

const tokenHash = (token: string): string =>
    createHash('sha256').update(`split-install-handoff\0${token}`).digest('hex')

const memberProofHash = (token: string): string =>
    createHash('sha256').update(`split-install-member-proof\0${token}`).digest('hex')

const validToken = (value: string | null): value is string =>
    value !== null && value.length === TOKEN_LENGTH && TOKEN_PATTERN.test(value)

/** Read the host-only secret cookie. Its base64url alphabet needs no decoding. */
export function installHandoffTokenFrom(request: Request): string | null {
    const pair = request.headers
        .get('cookie')
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${INSTALL_HANDOFF_COOKIE}=`))
    if (!pair) return null
    const value = pair.slice(INSTALL_HANDOFF_COOKIE.length + 1)
    return validToken(value) ? value : null
}

const persistentCookieAttributes = `Path=/; Max-Age=${INSTALL_HANDOFF_TTL_SECONDS}; Secure; SameSite=Strict`
const clearingCookieAttributes = 'Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Strict'

/** `__Host-` plus Secure + Path=/ + no Domain prevents a sibling subdomain from
 * cookie-tossing either name onto the app origin. */
export const preparedInstallHandoffCookieHeaders = (token: string): string[] => [
    `${INSTALL_HANDOFF_COOKIE}=${token}; ${persistentCookieAttributes}; HttpOnly`,
    `${INSTALL_HANDOFF_READY_COOKIE}=1; ${persistentCookieAttributes}`,
]

export const clearedInstallHandoffCookieHeaders = (): string[] => [
    `${INSTALL_HANDOFF_COOKIE}=; ${clearingCookieAttributes}; HttpOnly`,
    `${INSTALL_HANDOFF_READY_COOKIE}=; ${clearingCookieAttributes}`,
]

export function appendSetCookieHeaders(response: Response, values: readonly string[]): Response {
    for (const value of values) response.headers.append('Set-Cookie', value)
    return response
}

export async function prepareInstallHandoff(input: {
    roomId: string
    memberId: string | null
    memberToken: string | null
    previousToken: string | null
    now?: Date
}): Promise<string> {
    if ((input.memberId === null) !== (input.memberToken === null)) {
        throw new Error('install handoff member id and proof must be supplied together')
    }
    const now = input.now ?? new Date()
    const expiresAt = new Date(now.getTime() + INSTALL_HANDOFF_TTL_SECONDS * 1000)
    const token = randomBytes(TOKEN_BYTES).toString('base64url')
    const hash = tokenHash(token)
    const previousHash = validToken(input.previousToken) ? tokenHash(input.previousToken) : null

    await prisma.$transaction(async (tx) => {
        // Serialize the per-room cap. The room is already resolved by the route;
        // this lock adds no authorization semantics and releases at commit.
        await tx.$queryRaw`SELECT "id" FROM "split"."Room" WHERE "id" = ${input.roomId} FOR UPDATE`
        // This is the retention sweep as well as the ordinary prepare. An index
        // on expiresAt keeps it bounded even when the table grows.
        await tx.installHandoff.deleteMany({ where: { expiresAt: { lte: now } } })
        if (previousHash) await tx.installHandoff.deleteMany({ where: { tokenHash: previousHash } })

        // Refuse saturation without revoking somebody else's still-valid
        // install capability. A caller re-arming with its own cookie succeeds
        // because that row was removed above inside this same transaction.
        const outstanding = await tx.installHandoff.count({ where: { roomId: input.roomId } })
        if (outstanding >= MAX_OUTSTANDING_INSTALL_HANDOFFS_PER_ROOM) {
            throw new ApiError(429, 'RATE_LIMITED', 'this room has many pending install handoffs — try again later')
        }
        await tx.installHandoff.create({
            data: {
                tokenHash: hash,
                roomId: input.roomId,
                memberId: input.memberId,
                memberTokenHash: input.memberToken ? memberProofHash(input.memberToken) : null,
                expiresAt,
            },
        })
    })

    return token
}

/** Idempotent peek. The row stays until the client verifies both localStorage
 * writes and ACKs; a WebKit process kill between response and storage can then
 * retry instead of permanently losing the bridge. */
export async function redeemInstallHandoff(rawToken: string | null, now = new Date()): Promise<InstallHandoffPayload> {
    if (!validToken(rawToken)) throw unavailable()

    const row = await prisma.installHandoff.findUnique({
        where: { tokenHash: tokenHash(rawToken) },
        select: {
            expiresAt: true,
            roomId: true,
            memberTokenHash: true,
            room: { select: { slug: true, name: true, emoji: true, theme: true } },
            member: { select: { id: true, roomId: true, name: true, token: true, removedAt: true } },
        },
    })

    if (!row || row.expiresAt <= now) {
        // An expired row is terminal and carries no further recovery value.
        if (row) await prisma.installHandoff.deleteMany({ where: { tokenHash: tokenHash(rawToken) } })
        throw unavailable()
    }

    const member =
        row.member?.roomId === row.roomId &&
        row.member.removedAt === null &&
        row.memberTokenHash !== null &&
        memberProofHash(row.member.token) === row.memberTokenHash
            ? row.member
            : null
    return {
        room: row.room,
        identity: member ? { memberId: member.id, name: member.name, token: member.token } : null,
    }
}

/** Idempotent ACK. Missing, malformed, expired and already-consumed cookies all
 * mean the desired terminal state, so none becomes a distinguishable oracle. */
export async function acknowledgeInstallHandoff(rawToken: string | null): Promise<void> {
    if (!validToken(rawToken)) return
    await prisma.installHandoff.deleteMany({ where: { tokenHash: tokenHash(rawToken) } })
}

/** Runtime retention sweep. Access is already denied at expiresAt; this bounds
 * physical hash-row retention even when there is no later traffic or deploy. */
export async function pruneExpiredInstallHandoffs(now = new Date()): Promise<number> {
    const result = await prisma.installHandoff.deleteMany({ where: { expiresAt: { lte: now } } })
    return result.count
}
