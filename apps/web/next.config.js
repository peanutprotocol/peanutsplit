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
            // Serwist precaches all of `public/` by default, which would mean every visitor on
            // every platform downloading half a megabyte of iOS launch screens the page never
            // requests — iOS takes those from the OS at install time, not from a cache. This is
            // the same list minus `icons/splash`, written as an include list because glob drops
            // `!` patterns silently rather than treating them as exclusions.
            globPublicPatterns: ['*', 'doodles/**/*', 'fonts/*', 'icons/*'],
        })
        return withSerwist(withNextIntl(nextConfig))
    }
} else {
    module.exports = withNextIntl(nextConfig)
}
