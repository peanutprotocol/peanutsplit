import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SPLIT_ASSET_PREFIX } from '@/lib/domains'

interface ConfigProbe {
    assetPrefix: string | undefined
    skipMiddlewareUrlNormalize: boolean | undefined
    skipTrailingSlashRedirect: boolean | undefined
    rewrites: { source: string; destination: string }[]
    redirects: { source: string; destination: string; permanent: boolean }[]
}

/** Reads the real config the way Next does, so a probe cannot drift from what ships. */
function probeConfig(): ConfigProbe {
    const configPath = path.resolve(process.cwd(), 'next.config.js')
    const script = `
        process.env.NODE_ENV = 'development'
        const config = require(process.argv[1])
        Promise.all([config.rewrites(), config.redirects()]).then(([rewrites, redirects]) => {
            process.stdout.write(JSON.stringify({
                assetPrefix: config.assetPrefix,
                skipMiddlewareUrlNormalize: config.skipMiddlewareUrlNormalize,
                skipTrailingSlashRedirect: config.skipTrailingSlashRedirect,
                rewrites,
                redirects,
            }))
        })
    `
    return JSON.parse(execFileSync(process.execPath, ['-e', script, configPath], { encoding: 'utf8' })) as ConfigProbe
}

describe('the Split renderer build namespace', () => {
    it('uses the stable native asset prefix without a global URL-normalization change or prefix rewrite', () => {
        const result = probeConfig()

        expect(result.assetPrefix).toBe(SPLIT_ASSET_PREFIX)
        expect(result.skipMiddlewareUrlNormalize).not.toBe(true)
        expect(result.rewrites.some((rewrite) => rewrite.source.startsWith(`${SPLIT_ASSET_PREFIX}/`))).toBe(false)
    })

    it('builds the worker without registering it from the client entry shared with content', () => {
        const config = fs.readFileSync(path.resolve(process.cwd(), 'next.config.js'), 'utf8')
        const registrar = fs.readFileSync(
            path.resolve(process.cwd(), 'src/components/pwa/RegisterProductServiceWorker.tsx'),
            'utf8'
        )
        const contentRoot = fs.readFileSync(path.resolve(process.cwd(), 'src/app/(split-content)/layout.tsx'), 'utf8')

        expect(config).toMatch(/withSerwist[\s\S]*register:\s*false/)
        expect(config).toMatch(/withSerwist[\s\S]*reloadOnOnline:\s*false/)
        expect(registrar).toContain("process.env.NODE_ENV !== 'production'")
        expect(registrar).toContain('window.serwist.register()')
        expect(registrar).toContain("navigator.serviceWorker.register('/sw.js', { scope: '/' })")
        expect(registrar).toContain("window.addEventListener('online', reloadOnOnline)")
        expect(registrar).toContain("window.removeEventListener('online', reloadOnOnline)")
        expect(contentRoot).not.toContain('RegisterProductServiceWorker')
    })

    /**
     * The section root of nine indexed URLs is retired to the hub. The second half is the one that
     * matters: a wildcard source here would 308 every indexed guide URL off itself and deindex the
     * whole cohort, and it would still satisfy the first half.
     */
    it('retires the bare /guides section root without capturing a single guide URL', () => {
        const { redirects, skipTrailingSlashRedirect } = probeConfig()

        // Exact sources match their trailing-slash variants only while Next's own
        // slash-strip (which outranks them) stays off; the proxy strips for the rest.
        expect(skipTrailingSlashRedirect).toBe(true)
        expect(redirects.filter((redirect) => redirect.source.includes('guides'))).toEqual([
            { source: '/guides', destination: '/blog', permanent: true },
            { source: '/es-419/guides', destination: '/es-419/blog', permanent: true },
            { source: '/pt-br/guides', destination: '/pt-br/blog', permanent: true },
        ])
        for (const redirect of redirects) {
            expect(redirect.source, redirect.source).not.toMatch(/guides\/:/)
        }
    })

    /** Same probe one level up: the locale roots 404ed, and `/pt` never carried a territory. */
    it('sends the locale roots and the territory-less /pt to a hub', () => {
        const { redirects } = probeConfig()

        for (const [source, destination] of [
            ['/es-419', '/es-419/blog'],
            ['/pt-br', '/pt-br/blog'],
            ['/pt/:path*', '/pt-br/:path*'],
        ]) {
            expect(redirects).toContainEqual({ source, destination, permanent: true })
        }
    })
})
