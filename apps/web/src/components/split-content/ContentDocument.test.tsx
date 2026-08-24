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
    'name="google"',
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
            metadataBase: new URL('https://peanutsplit.com'),
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
        expect(contentRoot).not.toContain('RegisterProductServiceWorker')
        expect(productRoot).toContain('canonicalPwa ? <RegisterProductServiceWorker /> : null')
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
        // Metadata API output is streamed after <body> on dynamic room routes. Keep the PWA
        // discovery surface as literal markup inside the product root's initial <head> instead.
        const productHead = productRoot.match(/<head>([\s\S]*?)<\/head>/)?.[1]
        expect(productRoot).toContain('isCanonicalPwaRequest')
        expect(productHead).toMatch(/\{canonicalPwa \? \([\s\S]*split-install-preflight[\s\S]*\) : null\}/)
        expect(productHead).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
        expect(productHead).toContain('<meta name="mobile-web-app-capable" content="yes" />')
        expect(productHead).toContain('<meta name="apple-mobile-web-app-title" content="Split" />')
        expect(productHead).toContain('<link rel="icon" href="/icon.png" />')
        expect(productHead).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />')
        expect(productRoot).not.toContain("manifest: '/manifest.webmanifest'")
        expect(productRoot).not.toContain('appleWebApp:')
        expect(fs.existsSync(path.join(process.cwd(), 'public/favicon.ico'))).toBe(true)
        expect(fs.existsSync(path.join(process.cwd(), 'public/icon.png'))).toBe(true)
    })
})
