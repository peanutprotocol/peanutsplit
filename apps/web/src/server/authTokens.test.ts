import { afterEach, describe, expect, it } from 'vitest'
import { LOGIN_TOKEN_TTL_MS, claimedUserId, issueToken, verifyToken, type TokenPurpose } from '@/server/authTokens'

const USER = '11111111-2222-3333-4444-555555555555'
const NOW = 1_700_000_000_000

const login = (overrides: Partial<Parameters<typeof issueToken>[0]> = {}) =>
    issueToken({ userId: USER, purpose: 'login', epoch: 0, now: NOW, ...overrides })

/** The payload is base64url over `userId:expiry:purpose:epoch:hmac`, so a test
 *  can rewrite one field and re-encode to forge exactly one kind of tampering. */
const rewrite = (token: string, mutate: (parts: string[]) => string[]): string =>
    Buffer.from(mutate(Buffer.from(token, 'base64url').toString('utf8').split(':')).join(':')).toString('base64url')

const originalSecret = process.env.SPLIT_AUTH_SECRET

afterEach(() => {
    process.env.SPLIT_AUTH_SECRET = originalSecret
})

describe('magic-link tokens', () => {
    it('verifies a token it just issued', () => {
        expect(verifyToken(login(), 'login', 0, NOW + 1000)).toEqual({ ok: true, userId: USER })
    })

    it('names the user it was issued for without trusting the signature', () => {
        expect(claimedUserId(login())).toBe(USER)
        expect(claimedUserId('not-a-token')).toBeNull()
    })

    it('rejects a token whose user id was swapped', () => {
        const forged = rewrite(login(), (parts) => ['99999999-9999-9999-9999-999999999999', ...parts.slice(1)])
        expect(verifyToken(forged, 'login', 0, NOW)).toEqual({ ok: false, reason: 'bad-signature' })
    })

    it('rejects a token whose expiry was pushed out', () => {
        const forged = rewrite(login(), (parts) => [parts[0], String(NOW + 10 * LOGIN_TOKEN_TTL_MS), ...parts.slice(2)])
        expect(verifyToken(forged, 'login', 0, NOW)).toEqual({ ok: false, reason: 'bad-signature' })
    })

    it('rejects a token signed with a different secret', () => {
        const token = login()
        process.env.SPLIT_AUTH_SECRET = 'a-different-secret'
        expect(verifyToken(token, 'login', 0, NOW)).toEqual({ ok: false, reason: 'bad-signature' })
    })

    it('rejects a token whose purpose is not the one being spent', () => {
        // Purpose is inside the signature, so this has to be signed as itself.
        const other = issueToken({ userId: USER, purpose: 'reset' as unknown as TokenPurpose, epoch: 0, now: NOW })
        expect(verifyToken(other, 'login', 0, NOW)).toEqual({ ok: false, reason: 'purpose-mismatch' })
    })

    it('expires exactly at the stated moment', () => {
        const token = login()
        expect(verifyToken(token, 'login', 0, NOW + LOGIN_TOKEN_TTL_MS - 1).ok).toBe(true)
        expect(verifyToken(token, 'login', 0, NOW + LOGIN_TOKEN_TTL_MS)).toEqual({ ok: false, reason: 'expired' })
    })

    it('dies when the epoch moves on — a replayed link is signed and useless', () => {
        const token = login({ epoch: 3 })
        expect(verifyToken(token, 'login', 3, NOW).ok).toBe(true)
        expect(verifyToken(token, 'login', 4, NOW)).toEqual({ ok: false, reason: 'stale-epoch' })
    })

    it('rejects the wrong number of parts rather than reading past the end', () => {
        expect(verifyToken(Buffer.from('a:b:c').toString('base64url'), 'login', 0, NOW)).toEqual({
            ok: false,
            reason: 'malformed',
        })
        expect(verifyToken(Buffer.from(`${USER}:1:login:0:sig:extra`).toString('base64url'), 'login', 0, NOW)).toEqual({
            ok: false,
            reason: 'malformed',
        })
    })

    it('rejects non-numeric expiry and epoch', () => {
        expect(
            verifyToken(
                rewrite(login(), (p) => [p[0], 'soon', ...p.slice(2)]),
                'login',
                0,
                NOW
            )
        ).toEqual({
            ok: false,
            reason: 'malformed',
        })
        expect(
            verifyToken(
                rewrite(login(), (p) => [...p.slice(0, 3), '1.5', p[4]]),
                'login',
                0,
                NOW
            )
        ).toEqual({
            ok: false,
            reason: 'malformed',
        })
    })

    it('survives a signature of the wrong length — the comparison must not throw', () => {
        expect(
            verifyToken(
                rewrite(login(), (p) => [...p.slice(0, 4), 'short']),
                'login',
                0,
                NOW
            )
        ).toEqual({
            ok: false,
            reason: 'bad-signature',
        })
        expect(
            verifyToken(
                rewrite(login(), (p) => [...p.slice(0, 4), '']),
                'login',
                0,
                NOW
            )
        ).toEqual({
            ok: false,
            reason: 'malformed',
        })
    })

    it('rejects junk that is not a token at all', () => {
        expect(verifyToken('', 'login', 0, NOW).ok).toBe(false)
        expect(verifyToken('????', 'login', 0, NOW).ok).toBe(false)
    })
})
