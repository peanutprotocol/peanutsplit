import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8')

describe('canonical PWA head contract', () => {
    it('keeps install discovery as literal initial-head markup', () => {
        const headStart = source.indexOf('<head>')
        const headEnd = source.indexOf('</head>')
        const bodyStart = source.indexOf('<body\n', headEnd)
        const head = source.slice(headStart, headEnd)

        expect(headStart).toBeGreaterThan(-1)
        expect(headEnd).toBeGreaterThan(headStart)
        expect(bodyStart).toBeGreaterThan(headEnd)
        expect(head).toContain('showPwaIdentity &&')
        expect(head).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
        expect(head).toContain('<meta name="application-name" content="Split" />')
        expect(head).toContain('<meta name="apple-mobile-web-app-title" content="Split" />')
        expect(head).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />')
        expect(head).toMatch(/\{showPwaIdentity && \(\s*<Script id="split-install-preflight"/)
    })

    it('does not delegate PWA identity to streamable Next metadata', () => {
        const metadata = source.slice(source.indexOf('export const metadata'), source.indexOf('export const viewport'))

        expect(metadata).not.toMatch(/\bapplicationName\s*:/)
        expect(metadata).not.toMatch(/\bmanifest\s*:/)
        expect(metadata).not.toMatch(/\bappleWebApp\s*:/)
        expect(metadata).not.toMatch(/\bicons\s*:/)
        expect(source).not.toContain('<meta name="mobile-web-app-capable"')
    })

    it('uses an explicit host-aware route rather than Next implicit manifest metadata', () => {
        expect(existsSync(new URL('./manifest.ts', import.meta.url))).toBe(false)
        expect(existsSync(new URL('./manifest.webmanifest/route.ts', import.meta.url))).toBe(true)
    })
})
