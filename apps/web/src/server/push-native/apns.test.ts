import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, verify } from 'node:crypto'
import { isDeadApnsToken, signApnsToken } from '@/server/push-native/apns'

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))

describe('APNs provider token', () => {
    it('is an ES256 JWT that verifies against the key pair it was signed with', () => {
        // Apple's .p8 is a PKCS#8 P-256 key; a fresh one stands in for it.
        const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
        const keyP8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
        const now = Date.UTC(2026, 10, 14, 2, 0, 0)

        const token = signApnsToken({ keyP8, keyId: 'ABC123DEFG', teamId: 'TEAM123456' }, now)
        const [header, claims, signature] = token.split('.')

        expect(decode(header)).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' })
        expect(decode(claims)).toEqual({ iss: 'TEAM123456', iat: now / 1000 })
        const signatureBytes = Buffer.from(signature, 'base64url')
        // JOSE ES256 is the raw 64-byte r||s form, not DER.
        expect(signatureBytes).toHaveLength(64)
        expect(
            verify(
                'sha256',
                Buffer.from(`${header}.${claims}`),
                { key: publicKey, dsaEncoding: 'ieee-p1363' },
                signatureBytes
            )
        ).toBe(true)

        const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey
        expect(
            verify(
                'sha256',
                Buffer.from(`${header}.${claims}`),
                { key: other, dsaEncoding: 'ieee-p1363' },
                signatureBytes
            )
        ).toBe(false)
    })
})

describe('APNs dead-token classification', () => {
    it.each([
        [410, 'Unregistered', true],
        [400, 'BadDeviceToken', true],
        [400, 'BadCollapseId', false],
        [403, 'InvalidProviderToken', false],
        [429, 'TooManyRequests', false],
        [500, 'InternalServerError', false],
        [200, undefined, false],
    ])('status %i with reason %s → dead %s', (status, reason, dead) => {
        expect(isDeadApnsToken(status, reason)).toBe(dead)
    })
})
