/**
 * Magic-link tokens: stateless, HMAC-signed, purpose-scoped. There is no token
 * table, and there should not be one — a login link is a message in transit, not
 * state worth storing, and a table would need its own expiry sweep.
 *
 * Single-use comes from the epoch instead: every token names the `tokenEpoch` it
 * was signed against, a successful login bumps that number, and the replayed link
 * — still perfectly signed — now names a dead epoch. Forwarding the mail to a
 * friend after you have used it hands them nothing.
 *
 * The purpose field exists so a token minted for one flow can never be spent in
 * another. Today there is one purpose; the field costs nothing and the class of
 * bug it prevents (a link that logs you in being accepted as, say, a delete
 * confirmation) is the expensive kind.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { ApiError } from '@/server/http'

export type TokenPurpose = 'login'

/** Long enough to survive a slow mail hop, short enough that a forwarded inbox
 *  is not a standing key to the account. */
export const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000

/** Anything that isn't a hit says only "no". The reasons are for logs and tests;
 *  the routes must not tell the caller which one it was. */
export type VerifyFailure = 'malformed' | 'bad-signature' | 'purpose-mismatch' | 'expired' | 'stale-epoch'

export type VerifyResult = { ok: true; userId: string } | { ok: false; reason: VerifyFailure }

/** Only for local work: `pnpm dev` with no env should still produce a link you
 *  can click. Production refuses instead — an implicit key means every token in
 *  the wild is forgeable by anyone who reads this file. */
const DEV_FALLBACK_SECRET = 'split-dev-insecure-auth-secret'

/**
 * Read at call time, never at import time: the unit tests set the env per case,
 * and a module-level read would freeze whichever value happened to exist when
 * the first test file loaded.
 */
export function authSecret(): string {
    const configured = process.env.SPLIT_AUTH_SECRET
    if (configured) return configured
    if (process.env.NODE_ENV === 'production') {
        throw new ApiError(503, 'ACCOUNTS_DISABLED', 'accounts are not enabled')
    }
    return DEV_FALLBACK_SECRET
}

const sign = (payload: string): string => createHmac('sha256', authSecret()).update(payload).digest('base64url')

/** Constant-time only once the lengths agree — `timingSafeEqual` throws on a
 *  length mismatch rather than returning false, which would surface as a 500 on
 *  a request an attacker fully controls. */
function signatureMatches(expected: string, actual: string): boolean {
    const a = Buffer.from(expected)
    const b = Buffer.from(actual)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
}

export interface IssueInput {
    userId: string
    purpose: TokenPurpose
    /** The user's current `tokenEpoch`. */
    epoch: number
    ttlMs?: number
    now?: number
}

/** `base64url(userId:expiresAtMs:purpose:epoch:hmac)`. The outer encoding is
 *  cosmetic — it keeps the link free of characters that mail clients like to
 *  wrap — and every field is inside the signed payload. */
export function issueToken({
    userId,
    purpose,
    epoch,
    ttlMs = LOGIN_TOKEN_TTL_MS,
    now = Date.now(),
}: IssueInput): string {
    const payload = `${userId}:${now + ttlMs}:${purpose}:${epoch}`
    return Buffer.from(`${payload}:${sign(payload)}`).toString('base64url')
}

/**
 * Verifies signature, purpose, expiry and epoch — in that order, so a tampered
 * token is rejected before any of its claims are believed.
 */
export function verifyToken(
    token: string,
    purpose: TokenPurpose,
    currentEpoch: number,
    now = Date.now()
): VerifyResult {
    let decoded: string
    try {
        decoded = Buffer.from(token, 'base64url').toString('utf8')
    } catch {
        return { ok: false, reason: 'malformed' }
    }

    const parts = decoded.split(':')
    // Exactly five: a uuid, a millisecond stamp, a purpose and an integer contain
    // no colons, so a different count is a rewritten token, not an odd user id.
    if (parts.length !== 5) return { ok: false, reason: 'malformed' }

    const [userId, expiresAtRaw, tokenPurpose, epochRaw, signature] = parts
    if (!userId || !signature) return { ok: false, reason: 'malformed' }

    const expiresAt = Number(expiresAtRaw)
    const epoch = Number(epochRaw)
    if (!Number.isFinite(expiresAt) || !Number.isInteger(epoch)) return { ok: false, reason: 'malformed' }

    const payload = `${userId}:${expiresAtRaw}:${tokenPurpose}:${epochRaw}`
    if (!signatureMatches(sign(payload), signature)) return { ok: false, reason: 'bad-signature' }

    if (tokenPurpose !== purpose) return { ok: false, reason: 'purpose-mismatch' }
    if (now >= expiresAt) return { ok: false, reason: 'expired' }
    if (epoch !== currentEpoch) return { ok: false, reason: 'stale-epoch' }

    return { ok: true, userId }
}

/** The user id a token *claims*, without trusting it — the verifier needs the
 *  row to know the current epoch, and it cannot look one up without a name. */
export function claimedUserId(token: string): string | null {
    try {
        const parts = Buffer.from(token, 'base64url').toString('utf8').split(':')
        if (parts.length !== 5) return null
        return parts[0] || null
    } catch {
        return null
    }
}
