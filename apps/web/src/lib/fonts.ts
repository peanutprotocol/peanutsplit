import { Roboto_Flex, Sniglet } from 'next/font/google'

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

// Gluten, the hero display face, lives in globals.css (@font-face over public/fonts woff2), not
// here: next/font would hash its URL, and Title.tsx preloads it by stable URL.
export const bodyFontClassName = `${roboto.variable} ${sniglet.variable} font-sans`
