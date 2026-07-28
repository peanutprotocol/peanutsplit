const createNextIntlPlugin = require('next-intl/plugin')

/**
 * next-intl needs the plugin even though Split uses none of its routing: the plugin is what
 * aliases `next-intl/config` to `src/i18n/request.ts`. Without it every `useTranslations` call
 * resolves against an empty config and renders bare keys. No `./src/i18n/request.ts` argument —
 * that path is the plugin's own default.
 */
const withNextIntl = createNextIntlPlugin()

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Docker deploy target — Next emits .next/standalone/server.js
    output: 'standalone',
    reactStrictMode: true,
    productionBrowserSourceMaps: false,
}

// Serwist compiles src/app/sw.ts → public/sw.js. Skipped in dev so cold starts
// stay fast and the SW never caches a half-built dev bundle.
if (process.env.NODE_ENV !== 'development') {
    module.exports = async () => {
        const withSerwist = (await import('@serwist/next')).default({
            swSrc: './src/app/sw.ts',
            swDest: 'public/sw.js',
        })
        return withSerwist(withNextIntl(nextConfig))
    }
} else {
    module.exports = withNextIntl(nextConfig)
}
