import { afterEach, describe, expect, it, vi } from 'vitest'
import { magicLinkUrl, renderMagicLinkEmail, sendMagicLink } from '@/server/email'

afterEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.SPLIT_EMAIL_FROM
    vi.restoreAllMocks()
})

describe('magic-link email', () => {
    it('reports unconfigured — and sends nothing — with no provider key', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
        vi.spyOn(console, 'log').mockImplementation(() => {})

        expect(await sendMagicLink('ana@example.com', 'http://localhost:3000/api/auth/verify?token=x')).toEqual({
            ok: false,
            reason: 'unconfigured',
        })
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('prints the link in development so the flow is testable with no key', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})
        await sendMagicLink('ana@example.com', 'http://localhost:3000/api/auth/verify?token=abc')
        expect(log.mock.calls[0][0]).toContain('http://localhost:3000/api/auth/verify?token=abc')
    })

    it('builds the link from the configured base URL, never a literal host', () => {
        expect(magicLinkUrl('a b')).toBe('http://localhost:3000/api/auth/verify?token=a%20b')
    })

    it('hides the preheader and keeps both versions saying the same thing', () => {
        const { subject, html, text } = renderMagicLinkEmail('https://split.example/api/auth/verify?token=t')
        expect(subject).toBeTruthy()
        expect(html).toContain('display:none')
        expect(html).toContain('&zwnj;')
        expect(html).toContain('https://split.example/api/auth/verify?token=t')
        expect(text).toContain('https://split.example/api/auth/verify?token=t')
        // One CTA, so nothing competes with it.
        expect(html.match(/<a /g)).toHaveLength(1)
    })

    it('escapes the URL it is handed rather than pasting it into the markup', () => {
        const { html } = renderMagicLinkEmail('https://split.example/?a="><script>alert(1)</script>')
        expect(html).not.toContain('<script>')
    })

    it('marks a hard bounce as dead and a 500 as worth retrying', async () => {
        process.env.RESEND_API_KEY = 'test-key'
        process.env.SPLIT_EMAIL_FROM = 'Split <split@example.com>'

        vi.spyOn(console, 'error').mockImplementation(() => {})
        const fetchSpy = vi.spyOn(globalThis, 'fetch')

        fetchSpy.mockResolvedValueOnce(
            new Response(JSON.stringify({ name: 'invalid_to_email', message: 'nope' }), { status: 422 })
        )
        expect(await sendMagicLink('nope@example', 'http://x/y')).toEqual({
            ok: false,
            reason: 'rejected',
            deadToken: true,
        })

        fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ name: 'internal_error' }), { status: 500 }))
        expect(await sendMagicLink('ana@example.com', 'http://x/y')).toEqual({
            ok: false,
            reason: 'rejected',
            deadToken: false,
        })
    })

    it('treats a dead network as soft — the address is fine, the hop is not', async () => {
        process.env.RESEND_API_KEY = 'test-key'
        process.env.SPLIT_EMAIL_FROM = 'Split <split@example.com>'
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))

        expect(await sendMagicLink('ana@example.com', 'http://x/y')).toEqual({ ok: false, reason: 'network' })
    })
})
