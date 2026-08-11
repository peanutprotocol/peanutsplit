import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SPLIT_ASSET_PREFIX } from './transport'

interface ConfigProbe {
    assetPrefix: string | undefined
    skipMiddlewareUrlNormalize: boolean | undefined
    rewrites: { source: string; destination: string }[]
}

describe('the Split renderer build namespace', () => {
    it('uses the stable native asset prefix without a global URL-normalization change or prefix rewrite', () => {
        const configPath = path.resolve(process.cwd(), 'next.config.js')
        const script = `
            process.env.NODE_ENV = 'development'
            const config = require(process.argv[1])
            Promise.resolve(config.rewrites()).then((rewrites) => {
                process.stdout.write(JSON.stringify({
                    assetPrefix: config.assetPrefix,
                    skipMiddlewareUrlNormalize: config.skipMiddlewareUrlNormalize,
                    rewrites,
                }))
            })
        `
        const result = JSON.parse(
            execFileSync(process.execPath, ['-e', script, configPath], { encoding: 'utf8' })
        ) as ConfigProbe

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
})
