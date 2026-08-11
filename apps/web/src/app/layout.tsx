import { type Metadata, type Viewport } from 'next'
import { Roboto_Flex, Sniglet } from 'next/font/google'
import localFont from 'next/font/local'
import { headers } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import Script from 'next/script'
import { getLocale } from 'next-intl/server'
import { asLocale, HREFLANG } from '@/i18n/locales'
import { Providers } from '@/lib/providers'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SITE_DESCRIPTION, siteSchema } from '@/lib/seo'
import { siteUrl } from '@/lib/site'
import { isCanonicalPwaRequest } from '@/lib/pwa-manifest'
import { appleStartupImages } from '@/lib/splash'
import '../styles/globals.css'

export const metadata: Metadata = {
    title: 'Peanut Split — split expenses, no signup',
    // Shared with the SoftwareApplication node in `siteSchema()` — same sentence, one source.
    description: SITE_DESCRIPTION,
    metadataBase: new URL(siteUrl),
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    colorScheme: 'light',
    viewportFit: 'cover',
    themeColor: '#FFC900',
}

const roboto = Roboto_Flex({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-roboto',
    axes: ['wdth'],
})

const sniglet = Sniglet({
    weight: ['400', '800'],
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-sniglet',
})

const knerdOutline = localFont({
    src: '../assets/fonts/knerd-outline.ttf',
    variable: '--font-knerd-outline',
    display: 'swap',
})

const knerdFilled = localFont({
    src: '../assets/fonts/knerd-filled.ttf',
    variable: '--font-knerd-filled',
    display: 'swap',
})

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
    const requestHeaders = await headers()
    const showPwaIdentity = isCanonicalPwaRequest(requestHeaders)

    // Resolved by src/i18n/request.ts: the language the URL states, then ps-locale cookie →
    // Accept-Language → en. `lang` has to follow the URL and not the cookie — an English page
    // opened by a reader carrying `ps-locale=pt-br` is still an English page, and declaring it
    // Portuguese misreads it to a screen reader and misfiles it with a crawler.
    //
    // `HREFLANG`, not the raw code: `lang` is an HTML language tag, so it gets the standard
    // BCP 47 casing (`pt-BR`) rather than the lowercase spelling used in filenames and URLs.
    const locale = HREFLANG[asLocale(await getLocale())]

    return (
        <html lang={locale} translate="no" style={{ colorScheme: 'light' }} suppressHydrationWarning>
            <head>
                {/* These tags are literal children of <head>, not Next Metadata API values. Room
                    pages resolve metadata asynchronously; Next may stream that metadata into
                    <body>, where Chromium cannot discover a manifest. Keeping the app identity
                    here also lets the shared build omit it entirely on legacy/preview hosts. */}
                {showPwaIdentity && (
                    <>
                        <link rel="manifest" href="/manifest.webmanifest" />
                        <meta name="application-name" content="Split" />
                        <meta name="apple-mobile-web-app-capable" content="yes" />
                        <meta name="apple-mobile-web-app-title" content="Split" />
                        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
                        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
                        {appleStartupImages().map(({ url, media }) => (
                            <link key={media} rel="apple-touch-startup-image" href={url} media={media} />
                        ))}
                    </>
                )}
                <Script id="split-motion-preflight" strategy="beforeInteractive">
                    {motionPreferencePreflight}
                </Script>
                {showPwaIdentity && (
                    <Script id="split-install-preflight" strategy="beforeInteractive">
                        {installPromptPreflight}
                    </Script>
                )}
            </head>
            <body
                className={`${roboto.variable} ${sniglet.variable} ${knerdOutline.variable} ${knerdFilled.variable} font-sans`}
            >
                {/* WebSite + Organization + SoftwareApplication, declared once for the whole
                    site so every page's publisher can reference one entity by @id instead of
                    re-declaring an unlinked copy. Room pages are noindex, so this costs them
                    nothing. */}
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
