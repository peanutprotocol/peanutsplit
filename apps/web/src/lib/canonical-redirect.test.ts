import { describe, expect, it } from 'vitest'
import { canonicalRedirect } from './canonical-redirect'

describe('canonicalRedirect', () => {
    it('redirects every split.peanut.me path to the same peanutsplit.com path permanently', () => {
        for (const path of ['/', '/app', '/new', '/import', '/r/trip-abc123', '/blog', '/manifest.webmanifest']) {
            expect(canonicalRedirect('split.peanut.me', path, '')).toEqual({
                target: `https://peanutsplit.com${path}`,
                status: 308,
            })
        }
    })

    it('preserves query strings and canonicalises both www aliases', () => {
        expect(canonicalRedirect('www.split.peanut.me:443', '/r/trip-abc123', '?from=chat')).toEqual({
            target: 'https://peanutsplit.com/r/trip-abc123?from=chat',
            status: 308,
        })
        expect(canonicalRedirect('WWW.PEANUTSPLIT.COM', '/new', '?locale=pt-br')).toEqual({
            target: 'https://peanutsplit.com/new?locale=pt-br',
            status: 308,
        })
    })

    it('serves the canonical apex and non-production hosts in place', () => {
        for (const host of ['peanutsplit.com', 'localhost:3000', 'preview.example.com', '']) {
            expect(canonicalRedirect(host, '/app', '')).toBeNull()
        }
    })

    it('keeps health probes host-local', () => {
        for (const host of ['split.peanut.me', 'www.split.peanut.me', 'www.peanutsplit.com']) {
            expect(canonicalRedirect(host, '/healthcheck', '')).toBeNull()
            expect(canonicalRedirect(host, '/readiness', '')).toBeNull()
        }
    })

    it('never reflects an untrusted request host into the target', () => {
        expect(canonicalRedirect('split.peanut.me.evil.example', '/app', '?next=https://evil.example')).toBeNull()
    })
})
