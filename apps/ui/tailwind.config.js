const plugin = require('tailwindcss/plugin')

/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
	theme: {
		extend: {
			colors: {
				// Peanut's palette, with one deliberate swap: primary-1 is the
				// Split accent (violet), not Peanut pink — Split has to read as
				// its own product. Everything else is inherited unchanged.
				primary: {
					1: '#9D7EFE',
					2: '#8064DC',
					3: '#EFE4FF',
				},
				secondary: {
					1: '#FFC900',
				},
				n: {
					1: '#000000',
					2: '#161616',
					3: '#5F646D',
					4: '#E7E8E9',
				},
				grey: {
					1: '#5F646D',
					2: '#E7E8E9',
					3: '#FAF4F0',
					4: '#EFEFF0',
				},
				green: {
					1: '#98E9AB',
					2: '#EAFBEE',
				},
			},
			borderRadius: {
				sm: '0.25rem',
			},
			height: {
				13: '3.25rem',
			},
		},
	},
	plugins: [
		plugin(({ addComponents }) => {
			addComponents({
				'.btn': {
					'@apply inline-flex items-center justify-center h-13 px-5 border border-n-1 rounded-sm text-base text-n-1 font-bold transition-colors disabled:bg-n-4 disabled:text-grey-1 disabled:cursor-not-allowed':
						{},
				},
				'.btn-purple': { '@apply btn bg-primary-1 text-n-1 hover:bg-primary-1/90': {} },
				'.btn-dark': { '@apply btn bg-n-1 text-white hover:bg-n-1/80': {} },
				'.btn-stroke': { '@apply btn bg-white hover:bg-n-1 hover:text-white': {} },
				'.btn-transparent': { '@apply btn bg-transparent border-none hover:bg-transparent': {} },
				'.btn-small': { '@apply h-8 px-3 text-xs': {} },
				'.btn-medium': { '@apply h-9 px-3 text-xs': {} },
				'.btn-large': { '@apply h-10 px-3 text-lg': {} },
				'.btn-shadow-primary-3': { '@apply shadow-[0.1875rem_0.1875rem_0_#000000]': {} },
				'.btn-shadow-primary-4': { '@apply shadow-[0.25rem_0.25rem_0_#000000]': {} },
				'.btn-shadow-primary-6': { '@apply shadow-[0.375rem_0.375rem_0_#000000]': {} },
				'.btn-shadow-primary-8': { '@apply shadow-[0.5rem_0.5rem_0_#000000]': {} },
				'.btn-shadow-secondary-3': { '@apply shadow-[0.1875rem_-0.1875rem_0_#000000]': {} },
				'.btn-shadow-secondary-4': { '@apply shadow-[0.25rem_-0.25rem_0_#000000]': {} },
				'.btn-shadow-secondary-6': { '@apply shadow-[0.375rem_-0.375rem_0_#000000]': {} },
				'.btn-shadow-secondary-8': { '@apply shadow-[0.5rem_-0.5rem_0_#000000]': {} },
				'.shadow-primary-3': { '@apply shadow-[0.1875rem_0.1875rem_0_#000000]': {} },
				'.shadow-primary-4': { '@apply shadow-[0.25rem_0.25rem_0_#000000]': {} },
				'.shadow-primary-6': { '@apply shadow-[0.375rem_0.375rem_0_#000000]': {} },
				'.shadow-primary-8': { '@apply shadow-[0.5rem_0.5rem_0_#000000]': {} },
				'.shadow-secondary-3': { '@apply shadow-[0.1875rem_-0.1875rem_0_#000000]': {} },
				'.shadow-secondary-4': { '@apply shadow-[0.25rem_-0.25rem_0_#000000]': {} },
				'.shadow-secondary-6': { '@apply shadow-[0.375rem_-0.375rem_0_#000000]': {} },
				'.shadow-secondary-8': { '@apply shadow-[0.5rem_-0.5rem_0_#000000]': {} },
				'.custom-input': {
					'@apply w-full h-12 border border-n-1 rounded-none bg-white px-4 font-medium outline-none transition-colors placeholder:text-sm focus:border-primary-1':
						{},
				},
				'.custom-input-xs': { '@apply h-8': {} },
			})
		}),
	],
}
