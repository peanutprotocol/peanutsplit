const { fontFamily } = require('tailwindcss/defaultTheme')
const plugin = require('tailwindcss/plugin')

// Design system copied by value from peanut-ui (2026-07-25) and re-keyed to the
// Split identity: primary = #FFC900 (yellow). Legacy colour aliases and every
// dark: variant were stripped on the way in. Diverge freely — there is no
// dependency on peanut-ui.
/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        borderWidth: {
            DEFAULT: '1.5px',
            0: '0px',
            2: '2px',
            4: '4px',
            8: '8px',
        },
        extend: {
            colors: {
                primary: {
                    1: '#FFC900',
                    2: '#E5B500',
                    3: '#FFF4CC',
                    4: '#FAE184',
                },
                secondary: {
                    1: '#FF90E8',
                    2: '#E99898',
                    3: '#90A8ED',
                    4: '#FFF4CC',
                    5: '#FBEAEA',
                    6: '#E9EEFB',
                },
                grey: {
                    1: '#5F646D',
                    2: '#E7E8E9',
                    3: '#FAF4F0',
                    4: '#EFEFF0',
                },
                gray: {
                    1: '#5F646D',
                    2: '#9CA3AF',
                    3: '#e5e7eb',
                    4: '#d1d5db',
                    5: '#60646C',
                },
                outline: {
                    1: '#98E9AB',
                    2: '#AE7AFF',
                    3: '#E99898',
                },
                n: {
                    1: '#211C17',
                    2: '#2B251F',
                    3: '#5F646D',
                    4: '#E7E8E9',
                },
                yellow: {
                    1: '#FFC900',
                },
                green: {
                    1: '#98E9AB',
                    2: '#EAFBEE',
                },
                // Direction surfaces are intentionally separate from success/error.
                // A balance is ordinary ledger state, not an alert: the pale wash
                // supports the words and arrow without making debt look dangerous.
                balance: {
                    outgoing: '#FFF2EE',
                    'outgoing-accent': '#94483E',
                    incoming: '#EFFAF2',
                    'incoming-accent': '#246C3D',
                },
                white: '#FFFFFF',
                black: '#211C17',
                red: '#FF0000',

                'primary-base': 'var(--primary-color)',
                'secondary-base': 'var(--secondary-color)',
                accent: 'var(--accent-color)',
                background: '#FAF4F0',
                error: {
                    DEFAULT: '#B3261E',
                    1: '#FFD8D8',
                    2: '#EA8282',
                    3: '#FF4A4A',
                },
            },
            zIndex: {
                1: '1',
                2: '2',
                3: '3',
                4: '4',
                5: '5',
            },
            spacing: {
                0.25: '0.0625rem',
                0.75: '0.1875rem',
                '1.2em': '1.2em',
                4.5: '1.125rem',
                5.5: '1.375rem',
                6.5: '1.75rem',
                7.5: '1.875rem',
                8.5: '2.125rem',
                9.5: '2.375rem',
                13: '3.25rem',
                15: '3.75rem',
                17: '4.25rem',
                18: '4.5rem',
                19: '4.75rem',
                21: '5.25rem',
                22: '5.5rem',
                26: '6.5rem',
                30: '7.5rem',
                34: '8.5rem',
                38: '9.5rem',
                42: '10.5rem',
                58: '14.5rem',
            },
            transitionDuration: {
                DEFAULT: '200ms',
            },
            transitionTimingFunction: {
                DEFAULT: 'linear',
            },
            opacity: {
                85: '.85',
                95: '.95',
            },
            borderRadius: {
                1: '0.75rem',
                sm: '0.75rem',
                md: '0.875rem',
                lg: '1rem',
                xl: '1.25rem',
                '2xl': '1.5rem',
            },
            fontFamily: {
                sans: ['var(--font-roboto)', ...fontFamily.sans],
                display: ['var(--font-sniglet)', ...fontFamily.sans],
                'knerd-outline': ['var(--font-knerd-outline)', ...fontFamily.sans],
                'knerd-filled': ['var(--font-knerd-filled)', ...fontFamily.sans],
                roboto: ['var(--font-roboto)', ...fontFamily.sans],
            },
            fontSize: {
                0: ['0px', '0px'],
                sm: ['0.875rem', '1.3125rem'],
                '6xl': ['3rem', '3.25rem'],
                '7xl': ['7rem', '7rem'],
                '8xl': ['10rem', '10rem'],
                '9xl': ['12rem', '0.9'],
                h1: ['3rem', { lineHeight: '3.5rem', fontWeight: '800' }],
                h2: ['2.25rem', { lineHeight: '2.875rem', fontWeight: '800' }],
                h3: ['1.875rem', { lineHeight: '2.375rem', fontWeight: '800' }],
                h4: ['1.5rem', { lineHeight: '2rem', fontWeight: '800' }],
                h5: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '800' }],
                h6: ['1.125rem', { lineHeight: '1.5rem', fontWeight: '800' }],
                h7: ['1rem', { lineHeight: '1.25rem', fontWeight: '800' }],
                h8: ['0.875rem', { lineHeight: '1rem', fontWeight: '800' }],
                h9: ['0.75rem', { lineHeight: '0.875rem', fontWeight: '800' }],
                h10: ['0.625rem', { lineHeight: '0.75rem', fontWeight: '800' }],
            },
            fontWeight: {
                extraBlack: 1000,
            },
        },
    },
    plugins: [
        require('@headlessui/tailwindcss')({ prefix: 'ui' }),
        require('tailwind-scrollbar'),
        plugin(function ({ addBase, addComponents, addUtilities }) {
            addBase({
                html: {
                    '@apply text-[1rem]': {},
                },
                body: {
                    '@apply bg-background text-base antialiased': {},
                },
            })
            addComponents({
                '.row': {
                    '@apply flex flex-row items-center gap-2': {},
                },
                '.col': {
                    '@apply flex flex-col gap-2': {},
                },
                '.btn': {
                    '@apply disabled:bg-n-4 disabled:hover:bg-n-4/90 disabled:text-grey-1 disabled:cursor-not-allowed inline-flex items-center justify-center h-13 px-5 border border-n-1 rounded-sm text-base text-n-1 fill-n-1 font-bold transition-colors':
                        {},
                },
                '.btn svg': {
                    '@apply fill-inherit': {},
                    // Icons rendered through <Icon> carry `custom-size` and manage their own
                    // width/height. Anything else falls back to the 18px auto-sizing plus the
                    // auto-margin between icon and text. Keep the guard — without it the margin
                    // eats SVG width inside flex wrappers.
                    '&:not(.custom-size)': {
                        '@apply icon-18 first:mr-1.5 last:ml-1.5': {},
                    },
                },
                '.btn-transparent-light': {
                    '@apply btn border-transparent text-white fill-white hover:text-primary-1 hover:fill-primary-1': {},
                },
                '.btn-transparent-dark': {
                    '@apply btn border-transparent text-n-1 fill-n-1 hover:text-primary-1 hover:fill-primary-1': {},
                },
                '.btn-primary': {
                    '@apply btn bg-primary-1 text-n-1 fill-n-1 hover:bg-primary-1/90': {},
                },
                '.btn-yellow': {
                    '@apply btn bg-primary-1 text-n-1 fill-n-1 hover:bg-primary-1/90': {},
                },
                '.btn-dark': {
                    '@apply btn bg-n-1 text-white fill-white hover:bg-n-1/80': {},
                },
                '.btn-stroke': {
                    '@apply btn hover:bg-n-1 hover:text-white hover:fill-white': {},
                },
                '.btn-shadow': {
                    '@apply shadow-primary-4': {},
                },
                '.btn-square': {
                    '@apply !px-0': {},
                },
                '.btn-square svg': {
                    '@apply !ml-0 !mr-0': {},
                },
                '.btn-small': {
                    '@apply h-8 px-3 text-xs': {},
                },
                '.btn-medium': {
                    '@apply h-9 px-3 text-xs': {},
                },
                '.btn-large': {
                    '@apply h-10 px-3 text-lg': {},
                },
                '.btn-small svg, .btn-medium svg': {
                    '&:not(.custom-size)': {
                        '@apply icon-16': {},
                    },
                },
                '.btn-square.btn-small': {
                    '@apply w-8': {},
                },
                '.btn-square.btn-medium': {
                    '@apply w-9': {},
                },
                '.label': {
                    '@apply inline-flex justify-center items-center h-6 px-3 border rounded-md text-center text-xs font-bold text-n-1':
                        {},
                },
                '.label-stroke': {
                    '@apply label border-n-1': {},
                },
                '.label-stroke-yellow': {
                    '@apply label border-primary-1 text-primary-1': {},
                },
                '.label-stroke-pink': {
                    '@apply label border-secondary-1 text-secondary-1': {},
                },
                '.label-yellow': {
                    '@apply label border-primary-1 bg-primary-1': {},
                },
                '.label-pink': {
                    '@apply label border-secondary-1 bg-secondary-1': {},
                },
                '.label-black': {
                    '@apply label border-n-1 bg-n-1 text-white': {},
                },
                '.card': {
                    '@apply bg-white border border-n-1 rounded-sm max-w-[27rem] relative mx-auto w-11/12 flex flex-col items-center justify-center px-4 py-6':
                        {},
                },
                '.card-head': {
                    '@apply flex justify-between flex-col items-start min-h-[4rem] px-3 sm:px-5 py-3 border-b border-n-1':
                        {},
                },
                '.card-content': {
                    '@apply px-3 sm:px-5 py-3 border-n-1': {},
                },
                '.card-title': {
                    '@apply p-5 border-b border-n-1 text-h6': {},
                },
                '.icon-16': {
                    '@apply !w-4 !h-4': {},
                },
                '.icon-18': {
                    '@apply !w-4.5 !h-4.5': {},
                },
                '.icon-20': {
                    '@apply !w-5 !h-5': {},
                },
                '.icon-22': {
                    '@apply !w-5.5 !h-5.5': {},
                },
                '.icon-24': {
                    '@apply !w-6 !h-6': {},
                },
                '.icon-28': {
                    '@apply !w-7 !h-7': {},
                },
                '.shadow-2': {
                    '@apply shadow-[0.125rem_0.125rem_0_#211C17]': {},
                },
                '.shadow-4': {
                    '@apply shadow-[0.25rem_0.25rem_0_#211C17]': {},
                },
                '.shadow-primary-4': {
                    '@apply shadow-[0.25rem_0.25rem_0_#211C17]': {},
                },
                '.shadow-primary-6': {
                    '@apply shadow-[0.375rem_0.375rem_0_#211C17]': {},
                },
                '.shadow-primary-8': {
                    '@apply shadow-[0.5rem_0.5rem_0_#211C17]': {},
                },
                '.shadow-secondary-4': {
                    '@apply shadow-[0.25rem_-0.25rem_0_#211C17]': {},
                },
                '.shadow-secondary-6': {
                    '@apply shadow-[0.375rem_-0.375rem_0_#211C17]': {},
                },
                '.shadow-secondary-8': {
                    '@apply shadow-[0.5rem_-0.5rem_0_#211C17]': {},
                },
                '.btn-shadow-primary-3': {
                    '@apply shadow-[0.1875rem_0.1875rem_0_#211C17]': {},
                },
                '.btn-shadow-primary-4': {
                    '@apply shadow-[0.25rem_0.25rem_0_#211C17]': {},
                },
                '.btn-shadow-primary-6': {
                    '@apply shadow-[0.375rem_0.375rem_0_#211C17]': {},
                },
                '.btn-shadow-primary-8': {
                    '@apply shadow-[0.5rem_0.5rem_0_#211C17]': {},
                },
                '.btn-shadow-secondary-3': {
                    '@apply shadow-[0.1875rem_-0.1875rem_0_#211C17]': {},
                },
                '.btn-shadow-secondary-4': {
                    '@apply shadow-[0.25rem_-0.25rem_0_#211C17]': {},
                },
                '.btn-shadow-secondary-6': {
                    '@apply shadow-[0.375rem_-0.375rem_0_#211C17]': {},
                },
                '.btn-shadow-secondary-8': {
                    '@apply shadow-[0.5rem_-0.5rem_0_#211C17]': {},
                },
                '.brutal-border': {
                    '@apply border-2 border-black': {},
                },
                '.input': {
                    '@apply h-16 w-full rounded-sm border border-n-1 bg-white px-5 text-sm font-bold text-n-1 outline-none transition-colors placeholder:text-n-3 focus:border-primary-1':
                        {},
                },
                '.bg-peanut-repeat-normal': {
                    '@apply bg-[url("../assets/bg/peanut-bg.svg")] bg-repeat bg-[length:100px_100px]': {},
                },
                '.bg-peanut-repeat-large': {
                    '@apply bg-[url("../assets/bg/peanut-bg.svg")] bg-repeat bg-[length:200px_200px]': {},
                },
                '.bg-peanut-repeat-small': {
                    '@apply bg-[url("../assets/bg/peanut-bg.svg")] bg-repeat bg-[length:50px_50px]': {},
                },
            })
            addUtilities({
                '.tap-highlight-color': {
                    '-webkit-tap-highlight-color': 'rgba(0, 0, 0, 0)',
                },
            })
        }),
    ],
}
