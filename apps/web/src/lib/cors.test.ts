import { describe, expect, it } from 'vitest'
import { APP_ORIGINS, corsFor } from './cors'

const PREFLIGHT_HEADERS = (origin: string) => ({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, X-Member-Token',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
})

const RESPONSE_HEADERS = (origin: string) => ({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Expose-Headers': 'Content-Disposition',
    Vary: 'Origin',
})

const SLUG = 'ski-trip-kunc-syrup-drum'

describe('corsFor', () => {
    it('allows exactly the two Capacitor WebView origins', () => {
        expect(APP_ORIGINS).toEqual(['capacitor://localhost', 'https://localhost'])
    })

    it('answers a preflight from each app origin with the exact headers', () => {
        for (const origin of APP_ORIGINS) {
            expect(corsFor(origin, '/api/currencies', 'OPTIONS', undefined), origin).toEqual({
                kind: 'preflight',
                headers: PREFLIGHT_HEADERS(origin),
            })
        }
    })

    it('reflects the origin on every other method', () => {
        for (const origin of APP_ORIGINS) {
            for (const method of ['GET', 'POST', 'PATCH', 'DELETE', 'get']) {
                expect(corsFor(origin, `/api/rooms/${SLUG}`, method, undefined), `${origin} ${method}`).toEqual({
                    kind: 'response',
                    headers: RESPONSE_HEADERS(origin),
                })
            }
        }
    })

    it('covers the room card images outside /api', () => {
        for (const path of [`/r/${SLUG}/card/settled`, `/r/${SLUG}/recap/card`]) {
            expect(corsFor('capacitor://localhost', path, 'GET', undefined)?.kind, path).toBe('response')
        }
    })

    it('leaves pages and other room paths alone', () => {
        for (const path of [
            `/r/${SLUG}`,
            `/r/${SLUG}/recap`,
            `/r/${SLUG}/card`,
            `/r/${SLUG}/card/Settled`,
            `/r/${SLUG}/card/settled/extra`,
            `/r/${SLUG}/opengraph-image`,
            '/app',
            '/',
            '/apiary',
        ]) {
            expect(corsFor('capacitor://localhost', path, 'GET', undefined), path).toBeNull()
        }
    })

    it('keeps the cookie-bound install handoff same-origin only', () => {
        for (const path of ['/api/install-handoff', `/api/rooms/${SLUG}/install-handoff`]) {
            for (const method of ['OPTIONS', 'POST', 'GET']) {
                expect(corsFor('capacitor://localhost', path, method, undefined), `${method} ${path}`).toBeNull()
            }
        }
    })

    it('gives an unknown, missing or look-alike origin nothing', () => {
        for (const origin of [
            'https://evil.example',
            'http://localhost',
            'capacitor://localhost.evil.example',
            'https://localhost:8443',
            'https://peanutsplit.com',
            'null',
            '*',
            '',
            null,
        ]) {
            expect(corsFor(origin, '/api/currencies', 'OPTIONS', undefined), String(origin)).toBeNull()
            expect(corsFor(origin, '/api/currencies', 'GET', undefined), String(origin)).toBeNull()
        }
    })

    it('adds the e2e harness origins, trimmed, but never a wildcard or null', () => {
        const extra = ' http://localhost:8779 , http://127.0.0.1:8779,*,null,'
        expect(corsFor('http://localhost:8779', '/api/currencies', 'OPTIONS', extra)).toEqual({
            kind: 'preflight',
            headers: PREFLIGHT_HEADERS('http://localhost:8779'),
        })
        expect(corsFor('http://127.0.0.1:8779', '/api/currencies', 'GET', extra)?.kind).toBe('response')
        expect(corsFor('*', '/api/currencies', 'GET', extra)).toBeNull()
        expect(corsFor('null', '/api/currencies', 'GET', extra)).toBeNull()
        expect(corsFor('http://localhost:8780', '/api/currencies', 'GET', extra)).toBeNull()
    })

    it('never allows credentials and never answers with a wildcard', () => {
        const origins = [...APP_ORIGINS, 'http://localhost:8779']
        for (const origin of origins) {
            for (const method of ['OPTIONS', 'GET']) {
                const headers = corsFor(origin, '/api/currencies', method, 'http://localhost:8779')?.headers ?? {}
                const names = Object.keys(headers).map((name) => name.toLowerCase())
                expect(names).not.toContain('access-control-allow-credentials')
                expect(Object.values(headers)).not.toContain('*')
            }
        }
    })
})
