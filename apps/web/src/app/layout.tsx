import { type Metadata, type Viewport } from 'next'
import { Roboto_Flex, Sniglet } from 'next/font/google'
import localFont from 'next/font/local'
import { Providers } from '@/lib/providers'
import '../styles/globals.css'

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://split.peanut.me'

export const metadata: Metadata = {
    title: 'Peanut Split — split expenses, no signup',
    description:
        'Accountless, link-based expense splitting. Create a room, share the link, settle up however you like. Free forever.',
    metadataBase: new URL(baseUrl),
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
                <Providers>{children}</Providers>
            </body>
        </html>
    )
}
