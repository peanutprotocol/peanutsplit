import { describe, expect, it } from 'vitest'
import { canonicalRedirect } from './canonical-redirect'

const OFFICIAL = 'https://peanutsplit.com'
const SELF_HOSTED = 'https://split.example.org:8443'

describe('canonicalRedirect', () => {
    it('redirects every split.peanut.me path to the same peanutsplit.com path permanently', () => {
        for (const path of ['/', '/app', '/new', '/import', '/r/trip-abc123', '/blog', '/manifest.webmanifest']) {
            expect(canonicalRedirect('split.peanut.me', path, '', OFFICIAL)).toEqual({
                target: `https://peanutsplit.com${path}`,
                status: 308,
            })
        }
    })

    it('preserves query strings and canonicalises both www aliases', () => {
        expect(canonicalRedirect('www.split.peanut.me:443', '/r/trip-abc123', '?from=chat', OFFICIAL)).toEqual({
            target: 'https://peanutsplit.com/r/trip-abc123?from=chat',
            status: 308,
        })
        expect(canonicalRedirect('WWW.PEANUTSPLIT.COM', '/new', '?locale=pt-br', OFFICIAL)).toEqual({
            target: 'https://peanutsplit.com/new?locale=pt-br',
            status: 308,
        })
    })

    it('serves the canonical apex and non-production hosts in place', () => {
        for (const host of ['peanutsplit.com', 'localhost:3000', 'preview.example.com', '']) {
            expect(canonicalRedirect(host, '/app', '', OFFICIAL)).toBeNull()
        }
    })

    it('redirects every official host to a configured neutral origin without reflecting the request host', () => {
        for (const host of ['peanutsplit.com', 'www.peanutsplit.com', 'split.peanut.me', 'www.split.peanut.me']) {
            expect(canonicalRedirect(host, '/app', '?from=official', SELF_HOSTED)).toEqual({
                target: `${SELF_HOSTED}/app?from=official`,
                status: 308,
            })
        }
        expect(canonicalRedirect('split.example.org:8443', '/app', '', SELF_HOSTED)).toBeNull()
        expect(canonicalRedirect('split.example.org', '/app', '', SELF_HOSTED)).toEqual({
            target: `${SELF_HOSTED}/app`,
            status: 308,
        })
        expect(canonicalRedirect('attacker.example', '/app', '', SELF_HOSTED)).toBeNull()
    })

    it('collapses a legacy-alias configured origin onto the canonical apex instead of inverting', () => {
        expect(canonicalRedirect('peanutsplit.com', '/app', '', 'https://split.peanut.me')).toBeNull()
        expect(canonicalRedirect('split.peanut.me', '/app', '?from=chat', 'https://split.peanut.me')).toEqual({
            target: 'https://peanutsplit.com/app?from=chat',
            status: 308,
        })
    })

    it('keeps health probes host-local', () => {
        for (const host of ['split.peanut.me', 'www.split.peanut.me', 'www.peanutsplit.com']) {
            expect(canonicalRedirect(host, '/healthcheck', '', SELF_HOSTED)).toBeNull()
            expect(canonicalRedirect(host, '/readiness', '', SELF_HOSTED)).toBeNull()
        }
    })

    it('never reflects an untrusted request host into the target', () => {
        expect(
            canonicalRedirect('split.peanut.me.evil.example', '/app', '?next=https://evil.example', SELF_HOSTED)
        ).toBeNull()
        expect(canonicalRedirect('split.peanut.me', '/app', '', 'https://attacker.example/path')).toEqual({
            target: 'https://peanutsplit.com/app',
            status: 308,
        })
    })
})
