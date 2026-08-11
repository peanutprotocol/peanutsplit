import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SplitContentDocument } from './ContentDocument'
import { splitContentRootMetadata, SPLIT_CONTENT_VIEWPORT } from '@/lib/split-content/root-metadata'

const FORBIDDEN_CONTENT_HTML = [
    ['translate', '="no"'].join(''),
    'split-motion-preflight',
    'split-install-preflight',
    'manifest.webmanifest',
    'apple-touch-icon',
    'apple-mobile-web-app',
    'mobile-web-app-capable',
    'theme-color',
    '/favicon.ico',
    '/icon.png',
    'SoftwareApplication',
    'beforeinstallprompt',
]

describe('the isolated Split content root document', () => {
    it('declares the route locale without product PWA HTML or translation suppression', () => {
        const html = renderToStaticMarkup(
            <SplitContentDocument locale="pt-br" bodyClassName="font-contract">
                <main>content-only</main>
            </SplitContentDocument>
        )

        expect(html).toContain('<html lang="pt-BR"')
        expect(html).toContain('<body class="font-contract"><main>content-only</main></body>')
        for (const forbidden of FORBIDDEN_CONTENT_HTML) expect(html).not.toContain(forbidden)
    })

    it('explicitly removes product metadata and theme chrome from the content branch', () => {
        expect(splitContentRootMetadata()).toMatchObject({
            metadataBase: new URL('https://peanut.me'),
            applicationName: null,
            appleWebApp: null,
            icons: null,
            manifest: null,
        })
        expect(SPLIT_CONTENT_VIEWPORT).toEqual({
            width: 'device-width',
            initialScale: 1,
            colorScheme: 'light',
        })
        expect(SPLIT_CONTENT_VIEWPORT).not.toHaveProperty('themeColor')
    })

    it('uses a distinct root layout from every product special file, script, schema, and provider', () => {
        const contentRoot = fs.readFileSync(path.join(process.cwd(), 'src/app/(split-content)/layout.tsx'), 'utf8')
        const productRoot = fs.readFileSync(path.join(process.cwd(), 'src/app/(product-shell)/layout.tsx'), 'utf8')

        expect(contentRoot).toContain('<SplitContentDocument')
        expect(contentRoot).toContain('isSplitContentRender')
        for (const forbidden of [
            'motionPreferencePreflight',
            'installPromptPreflight',
            'siteSchema()',
            '<Providers>',
            '<NextIntlClientProvider>',
        ]) {
            expect(contentRoot).not.toContain(forbidden)
            expect(productRoot).toContain(forbidden)
        }

        expect(fs.existsSync(path.join(process.cwd(), 'src/app/layout.tsx'))).toBe(false)
        for (const specialFile of ['manifest.ts', 'favicon.ico', 'icon.png']) {
            expect(fs.existsSync(path.join(process.cwd(), 'src/app', specialFile))).toBe(false)
        }
        expect(productRoot).toContain("manifest: '/manifest.webmanifest'")
        expect(productRoot).toContain("icon: '/icon.png'")
        expect(fs.existsSync(path.join(process.cwd(), 'public/favicon.ico'))).toBe(true)
        expect(fs.existsSync(path.join(process.cwd(), 'public/icon.png'))).toBe(true)
    })
})
