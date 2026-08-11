import { type Metadata, type Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import Script from 'next/script'
import { getLocale } from 'next-intl/server'
import { asLocale, HREFLANG } from '@/i18n/locales'
import { bodyFontClassName } from '@/lib/fonts'
import { Providers } from '@/lib/providers'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SITE_DESCRIPTION, siteSchema } from '@/lib/seo'
import { siteUrl } from '@/lib/site'
import { appleStartupImages } from '@/lib/splash'
import '../../styles/globals.css'

export const metadata: Metadata = {
    title: 'Peanut Split — split expenses, no signup',
    // Shared with the SoftwareApplication node in `siteSchema()` — same sentence, one source.
    description: SITE_DESCRIPTION,
    metadataBase: new URL(siteUrl),
    // The app CHROME is "Split": launcher label, home-screen label, lock-screen sender. Everything
    // a search engine or a group chat sees — the title above, `SITE_NAME`, every OG unfurl — stays
    // "Peanut Split".
    applicationName: 'Split',
    manifest: '/manifest.webmanifest',
    // Next fills the rest of this object in: `capable` defaults to true and `statusBarStyle` to
    // 'default', so this one line also emits <meta name="mobile-web-app-capable"> and
    // <meta name="apple-mobile-web-app-status-bar-style">. What we are here for is
    // `apple-mobile-web-app-title` — the name iOS proposes in the Add to Home Screen dialog, which
    // the manifest cannot set. Chromeless launch on iOS comes from the manifest's
    // `display: 'standalone'`; Next 16 emits no `apple-mobile-web-app-capable` tag at all, so
    // pre-16.4 iOS gains nothing from this.
    // `startupImage` is what an installed iOS app shows while it boots. Without it that second is
    // a blank `background_color` screen; the matching is per exact device geometry, so it is a file
    // per phone. `splash.ts` owns the table and `pnpm icons` renders it.
    appleWebApp: { title: 'Split', startupImage: appleStartupImages() },
    icons: { icon: '/icon.png', shortcut: '/favicon.ico', apple: '/icons/apple-touch-icon.png' },
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    colorScheme: 'light',
    viewportFit: 'cover',
    themeColor: '#FFC900',
}

/**
 * The app preference has to exist before React and Motion mount. Otherwise an
 * animations-off user receives the animated SSR first frame and only gets the
 * still class in an effect. The OS preference is handled even earlier by CSS's
 * media query; this tiny local-only read covers the in-app switch.
 */
const motionPreferencePreflight = `
try {
  var splitSettings = JSON.parse(localStorage.getItem('ps:settings') || '{}');
  if (splitSettings.animationsEnabled === false) {
    document.documentElement.classList.add('reduce-animations');
  }
} catch (_) {}
`

/**
 * Chrome can finish its installability check before React hydrates on a fast returning device.
 * Keep that single-use event until the install store mounts, or the install action is lost.
 */
const installPromptPreflight = `
window.__splitInstallPrompt = null;
window.addEventListener('beforeinstallprompt', function (event) {
  event.preventDefault();
  window.__splitInstallPrompt = event;
});
`

/**
 * The locale is a per-request fact, so this layout reads a dynamic API and every route under it
 * renders per request rather than at build time. That is inherent to "one URL per room, in any
 * language" — there is no static HTML that can be correct for three languages at once.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
    // Resolved by src/i18n/request.ts: the language the URL states, then ps-locale cookie →
    // Accept-Language → en. `lang` has to follow the URL and not the cookie — an English page
    // opened by a reader carrying `ps-locale=pt-br` is still an English page, and declaring it
    // Portuguese misreads it to a screen reader and misfiles it with a crawler.
    //
    // `HREFLANG`, not the raw code: `lang` is an HTML language tag, so it gets the standard
    // BCP 47 casing (`pt-BR`) rather than the lowercase spelling used in filenames and URLs.
    const locale = asLocale(await getLocale())
    return (
        <html lang={HREFLANG[locale]} translate="no" style={{ colorScheme: 'light' }} suppressHydrationWarning>
            <head>
                <Script id="split-motion-preflight" strategy="beforeInteractive">
                    {motionPreferencePreflight}
                </Script>
                <Script id="split-install-preflight" strategy="beforeInteractive">
                    {installPromptPreflight}
                </Script>
            </head>
            <body className={bodyFontClassName}>
                {/* Legacy WebSite + Organization plus the app-origin SoftwareApplication,
                    declared once so unmigrated page schema is host-consistent while the product
                    entity keeps its split.peanut.me identity. Room pages are noindex. */}
                <JsonLd data={siteSchema()} />
                {/* No `messages` prop: rendered from a Server Component, the provider inherits
                    the request config, which serialises only the active catalog to the client.
                    Passing `await getMessages()` here would do the same work twice. */}
                <NextIntlClientProvider>
                    <Providers>{children}</Providers>
                </NextIntlClientProvider>
            </body>
        </html>
    )
}
