import { Roboto_Flex, Sniglet } from 'next/font/google'
import localFont from 'next/font/local'

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

export const bodyFontClassName = `${roboto.variable} ${sniglet.variable} ${knerdOutline.variable} ${knerdFilled.variable} font-sans`
