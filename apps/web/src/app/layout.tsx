import { type Metadata, type Viewport } from 'next'
import { Roboto_Flex, Sniglet } from 'next/font/google'
import localFont from 'next/font/local'
import { Providers } from '@/lib/providers'
import { JsonLd } from '@/components/marketing/JsonLd'
import { siteSchema } from '@/lib/seo'
import { siteUrl } from '@/lib/site'
import '../styles/globals.css'

export const metadata: Metadata = {
    title: 'Peanut Split — split expenses, no signup',
    description:
        'Accountless, link-based expense splitting. Create a room, share the link, settle up however you like. Free forever.',
    metadataBase: new URL(siteUrl),
    applicationName: 'Peanut Split',
    icons: { apple: '/icons/apple-touch-icon.png' },
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" style={{ colorScheme: 'light' }}>
            <body
                className={`${roboto.variable} ${sniglet.variable} ${knerdOutline.variable} ${knerdFilled.variable} font-sans`}
            >
                {/* WebSite + Organization + SoftwareApplication, declared once for the whole
                    site so every page's publisher can reference one entity by @id instead of
                    re-declaring an unlinked copy. Room pages are noindex, so this costs them
                    nothing. */}
                <JsonLd data={siteSchema()} />
                <Providers>{children}</Providers>
            </body>
        </html>
    )
}
