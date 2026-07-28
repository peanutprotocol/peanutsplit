/**
 * Accounts, and the narrow thing they are for.
 *
 * Split is accountless by design and stays that way: the room link is the
 * credential, joining is a tap, and nobody is asked to sign up. The one problem
 * an account solves is device loss. Identity today lives in `localStorage` per
 * room (`ps:member:<slug>`), so a new phone orphans every room you were in — the
 * links are gone and there is nothing to look them up by. An account is an email
 * address that survives the phone, and nothing more: no password, no profile, no
 * ownership over a room.
 *
 * Everything here is inert without `SPLIT_AUTH_SECRET`; see `authTokens.ts`.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { badRequest } from '@/server/http'
import { claimedUserId, issueToken, verifyToken } from '@/server/authTokens'
import { magicLinkUrl, sendMagicLink } from '@/server/email'
import type { Limit } from '@/server/rateLimit'

const HOUR_MS = 60 * 60 * 1000

/** Three an hour is two more than anyone needs and few enough to be useless as
 *  a way to post mail through someone else's letterbox. */
export const REQUEST_LINK_LIMIT: Limit = { capacity: 3, windowMs: HOUR_MS }
/** Verification is cheap and legitimately retried (mail clients prefetch, people
 *  double-tap), so the ceiling only has to stop token grinding. */
export const VERIFY_LIMIT: Limit = { capacity: 10, windowMs: HOUR_MS }
/** Attaching is a one-shot migration of whatever this device holds. */
export const ATTACH_LIMIT: Limit = { capacity: 10, windowMs: HOUR_MS }

/** The whole point of the account: reopen your rooms elsewhere. Fifty is well
 *  past any real trip history and keeps the response one screen of JSON. */
const MAX_ROOMS = 50

/**
 * A floor on how long `request-link` takes. Returning instantly when no mail
 * went out and slowly when it did is an enumeration oracle — the difference is a
 * provider round trip, which is trivially measurable from a browser. Both paths
 * pay the same wall-clock price so the answer carries no information.
 */
const MIN_REQUEST_LINK_MS = 400

const isUniqueViolation = (err: unknown): boolean =>
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Read, create, and re-read on collision. Not `upsert`: Prisma's upsert with an
 * empty `update` is not `ON CONFLICT DO NOTHING` — it is a SELECT followed by an
 * INSERT, so two tabs submitting the same address at the same moment both miss
 * the SELECT and the loser throws P2002. The unique index is the arbiter; this
 * just asks it who won.
 */
async function findOrCreateUserByEmail(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return existing
    try {
        return await prisma.user.create({ data: { email } })
    } catch (err) {
        if (!isUniqueViolation(err)) throw err
        const winner = await prisma.user.findUnique({ where: { email } })
        if (!winner) throw err
        return winner
    }
}

/**
 * Mints a login link and posts it. Always resolves: whether the address is new,
 * known, or unreachable is between the mail provider and the recipient — the
 * caller learns nothing either way, because learning would be account
 * enumeration.
 */
export async function requestMagicLink(email: string): Promise<void> {
    const startedAt = Date.now()
    try {
        const user = await findOrCreateUserByEmail(email)
        const token = issueToken({ userId: user.id, purpose: 'login', epoch: user.tokenEpoch })
        await sendMagicLink(email, magicLinkUrl(token))
    } catch (err) {
        // A failed send is our problem, not the visitor's, and telling them which
        // addresses break would be the same leak by another route.
        console.error('[auth] magic link request failed', err)
    }
    const elapsed = Date.now() - startedAt
    if (elapsed < MIN_REQUEST_LINK_MS) await wait(MIN_REQUEST_LINK_MS - elapsed)
}

const linkRejected = () => badRequest('that link has expired — ask for a new one', 'INVALID_LOGIN_TOKEN')

/**
 * Spends a login token. The epoch bump is a conditional update against the epoch
 * we just verified, so two taps on the same link race the database rather than
 * each other and exactly one of them wins.
 */
export async function completeLogin(token: string): Promise<string> {
    const claimed = claimedUserId(token)
    if (!claimed) throw linkRejected()

    const user = await prisma.user.findUnique({ where: { id: claimed }, select: { id: true, tokenEpoch: true } })
    if (!user) throw linkRejected()

    if (!verifyToken(token, 'login', user.tokenEpoch).ok) throw linkRejected()

    const now = new Date()
    const spent = await prisma.user.updateMany({
        where: { id: user.id, tokenEpoch: user.tokenEpoch },
        data: { tokenEpoch: { increment: 1 }, emailVerifiedAt: now, lastSeenAt: now },
    })
    if (spent.count === 0) throw linkRejected()

    return user.id
}

export interface AccountSummary {
    userId: string
    email: string | null
}

export async function accountSummary(userId: string): Promise<AccountSummary | null> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
    return user ? { userId: user.id, email: user.email } : null
}

export interface MembershipClaim {
    slug: string
    memberId: string
    token: string
}

/** `linked` is idempotent — re-sending a membership this account already owns is
 *  a success, not a conflict. */
export type AttachOutcome = 'linked' | 'already-linked' | 'token-mismatch'

export interface AttachResult {
    slug: string
    memberId: string
    outcome: AttachOutcome
}

/**
 * Folds this device's room identities into the account.
 *
 * The member token is the only accepted proof. A token-less identity — someone
 * who tapped "I'm Bea" on the join gate and was believed — is deliberately not
 * linkable: impersonation inside a room is tolerated (the room can see it and
 * fix it), but it must never harden into a durable account graph where Bea's
 * trip history hangs off a stranger's email.
 *
 * Never steals: a member already linked to a different account is skipped, not
 * reassigned. Per item, skip rather than fail — one bad entry from an old
 * localStorage blob should not throw away the twelve good ones next to it.
 */
export async function attachMemberships(userId: string, claims: MembershipClaim[]): Promise<AttachResult[]> {
    const members = await prisma.member.findMany({
        where: { token: { in: claims.map((claim) => claim.token) } },
        select: { id: true, token: true, userId: true, room: { select: { slug: true } } },
    })
    const byToken = new Map(members.map((member) => [member.token, member]))

    const toLink: string[] = []
    const results = claims.map((claim): AttachResult => {
        const base = { slug: claim.slug, memberId: claim.memberId }
        const member = byToken.get(claim.token)
        // The token must name this exact member in this exact room. A token that
        // matches something else is no more convincing than one that matches
        // nothing, and both get the same answer.
        if (!member || member.id !== claim.memberId || member.room.slug !== claim.slug) {
            return { ...base, outcome: 'token-mismatch' }
        }
        if (member.userId && member.userId !== userId) return { ...base, outcome: 'already-linked' }
        if (!member.userId) toLink.push(member.id)
        return { ...base, outcome: 'linked' }
    })

    if (toLink.length > 0) {
        // One statement, and `userId: null` in the filter so a link that landed
        // between the read and the write is left alone rather than overwritten.
        await prisma.member.updateMany({ where: { id: { in: toLink }, userId: null }, data: { userId } })
    }
    return results
}

export interface AccountRoom {
    slug: string
    name: string
    emoji: string | null
    memberId: string
    memberName: string
    memberToken: string
}

/**
 * The device-recovery payload. It hands back the stored member token, which is
 * the one deliberate exception to "the token is returned exactly once": the
 * account has already proved it owns this member, and re-issuing the token to
 * its proven owner on a new phone *is* the feature. Nothing else may read it.
 */
export async function listRoomsForUser(userId: string): Promise<AccountRoom[]> {
    const members = await prisma.member.findMany({
        where: { userId, removedAt: null },
        select: { id: true, name: true, token: true, room: { select: { slug: true, name: true, emoji: true } } },
        orderBy: { room: { createdAt: 'desc' } },
        take: MAX_ROOMS,
    })
    return members.map((member) => ({
        slug: member.room.slug,
        name: member.room.name,
        emoji: member.room.emoji,
        memberId: member.id,
        memberName: member.name,
        memberToken: member.token,
    }))
}
