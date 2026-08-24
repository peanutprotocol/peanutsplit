import { type Metadata, type Viewport } from 'next'
import { headers } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { JsonLd } from '@/components/marketing/JsonLd'
import { RegisterProductServiceWorker } from '@/components/pwa/RegisterProductServiceWorker'
import { asLocale, HREFLANG } from '@/i18n/locales'
import { bodyFontClassName } from '@/lib/fonts'
import { isCanonicalPwaRequest } from '@/lib/pwa-manifest'
import { Providers } from '@/lib/providers'
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
    const [requestHeaders, requestLocale] = await Promise.all([headers(), getLocale()])
    const locale = asLocale(requestLocale)
    const canonicalPwa = isCanonicalPwaRequest(requestHeaders)
    return (
        <html lang={HREFLANG[locale]} translate="no" style={{ colorScheme: 'light' }} suppressHydrationWarning>
            <head>
                {/* Chrome's page-level translation prompt checks this literal head tag, not the
                    standard translate="no" document attribute. Split owns the product locale, so
                    keep Chrome from offering a second translation layer after a locale reload. */}
                <meta name="google" content="notranslate" />
                {/* Next streams Metadata API output after <body> on dynamic room routes. Browsers
                    ignore a manifest discovered there, which made the room surface ineligible for
                    installation. These product-only tags must be literal initial-head markup; the
                    separate Split content root therefore remains PWA-free. */}
                {canonicalPwa ? (
                    <>
                        <meta name="application-name" content="Split" />
                        <link rel="manifest" href="/manifest.webmanifest" />
                        <meta name="mobile-web-app-capable" content="yes" />
                        <meta name="apple-mobile-web-app-title" content="Split" />
                        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
                        <link rel="shortcut icon" href="/favicon.ico" />
                        <link rel="icon" href="/icon.png" />
                        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
                        {/* iOS matches startup images on exact device geometry. `splash.ts` owns the
                            table and `pnpm icons` renders the corresponding files. */}
                        {appleStartupImages().map(({ url, media }) => (
                            <link key={url} rel="apple-touch-startup-image" href={url} media={media} />
                        ))}
                        {/* Literal parser-blocking scripts, not next/script: App Router serialises
                            `beforeInteractive` into the bootstrap, which lands ~150-350ms after
                            first paint on a slow device — the exact window these must precede.
                            The install one would miss `beforeinstallprompt` the same way. */}
                        <script
                            id="split-install-preflight"
                            dangerouslySetInnerHTML={{ __html: installPromptPreflight }}
                        />
                    </>
                ) : null}
                <script id="split-motion-preflight" dangerouslySetInnerHTML={{ __html: motionPreferencePreflight }} />
            </head>
            <body className={bodyFontClassName}>
                {canonicalPwa ? <RegisterProductServiceWorker /> : null}
                {/* One WebSite, Organization and SoftwareApplication graph for the canonical
                    peanutsplit.com identity. Room pages remain noindex. */}
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
