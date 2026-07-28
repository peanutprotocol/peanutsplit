import { describe, expect, it } from 'vitest'
import { isAllowedPushEndpoint } from '@/server/pushHosts'

describe('push endpoint allowlist', () => {
    it('accepts the four real push services', () => {
        expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc123')).toBe(true)
        expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
        expect(isAllowedPushEndpoint('https://db5p.notify.windows.com/w/?token=abc')).toBe(true)
        expect(isAllowedPushEndpoint('https://web.push.apple.com/QK123')).toBe(true)
    })

    it('rejects anything else — this is the SSRF gate', () => {
        expect(isAllowedPushEndpoint('https://attacker.example.com/hook')).toBe(false)
        expect(isAllowedPushEndpoint('https://localhost/hook')).toBe(false)
        expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false)
    })

    it('rejects plain http on an otherwise valid host', () => {
        expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false)
    })

    it('matches suffixes on the dot, so a lookalike domain does not slip through', () => {
        expect(isAllowedPushEndpoint('https://web.push.apple.com.attacker.net/x')).toBe(false)
        expect(isAllowedPushEndpoint('https://notpush.apple.com/x')).toBe(false)
        expect(isAllowedPushEndpoint('https://xnotify.windows.com/x')).toBe(false)
    })

    it('rejects a host that merely contains an allowed one', () => {
        expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.net/x')).toBe(false)
    })

    it('rejects anything that is not a URL', () => {
        expect(isAllowedPushEndpoint('')).toBe(false)
        expect(isAllowedPushEndpoint('fcm.googleapis.com/fcm/send/abc')).toBe(false)
    })
})
