import { type Metadata, type Viewport } from 'next'
import { Roboto_Flex, Sniglet } from 'next/font/google'
import localFont from 'next/font/local'
import { NextIntlClientProvider } from 'next-intl'
import Script from 'next/script'
import { getLocale } from 'next-intl/server'
import { Providers } from '@/lib/providers'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SITE_DESCRIPTION, siteSchema } from '@/lib/seo'
import { siteUrl } from '@/lib/site'
import '../styles/globals.css'

export const metadata: Metadata = {
    title: 'Peanut Split — split expenses, no signup',
    // Shared with the SoftwareApplication node in `siteSchema()` — same sentence, one source.
    description: SITE_DESCRIPTION,
    metadataBase: new URL(siteUrl),
    applicationName: 'Peanut Split',
    icons: { apple: '/icons/apple-touch-icon.png' },
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    colorScheme: 'light',
    viewportFit: 'cover',
    themeColor: '#FF90E8',
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
 * The locale is a cookie, so this layout reads a dynamic API and every route under it renders
 * per request rather than at build time. That is inherent to "one URL per room, in any
 * language" — there is no static HTML that can be correct for three languages at once.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
    // Resolved by src/i18n/request.ts: ps-locale cookie → Accept-Language → en.
    const locale = await getLocale()

    return (
        <html lang={locale} style={{ colorScheme: 'light' }} suppressHydrationWarning>
            <head>
                <Script id="split-motion-preflight" strategy="beforeInteractive">
                    {motionPreferencePreflight}
                </Script>
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
