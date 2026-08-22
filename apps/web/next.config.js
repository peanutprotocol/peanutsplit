const createNextIntlPlugin = require('next-intl/plugin')

/**
 * next-intl needs the plugin even though Split uses none of its routing: the plugin is what
 * aliases `next-intl/config` to `src/i18n/request.ts`. Without it every `useTranslations` call
 * resolves against an empty config and renders bare keys. No `./src/i18n/request.ts` argument —
 * that path is the plugin's own default.
 */
const withNextIntl = createNextIntlPlugin()
const SPLIT_ASSET_PREFIX = '/split-static'

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Docker deploy target — Next emits .next/standalone/server.js
    output: 'standalone',
    reactStrictMode: true,
    productionBrowserSourceMaps: false,
    // Stable, collision-free namespace shared by product and content chunks. Next serves
    // `${assetPrefix}/_next/*` natively; adding an internal rewrite masks that contract.
    assetPrefix: SPLIT_ASSET_PREFIX,

    // Next's built-in slash-strip redirect outranks every rule below, which forced
    // `/guides/` through two 308s (`/guides` first, `/blog` second). With it off, the
    // exact-string sources below already match their trailing-slash variants in one hop,
    // and the proxy owns the general strip for everything else.
    skipTrailingSlashRedirect: true,

    /**
     * Two retirements, neither of them locale detection: nothing here reads `Accept-Language` or a
     * cookie, and no reader is ever moved off the language they asked for.
     *
     * `/es/…` — the Spanish pages shipped there before the locale codes carried a territory. They
     * are `/es-419/…` now, and four indexed URLs would otherwise 404. `/es` itself is not listed:
     * it never resolved to anything, because the app shell answers at one URL in every language.
     * Delete it once Search Console shows no impressions left on `/es/*`.
     *
     * `/guides` — the section root above nine indexed guide URLs, and a live 404. Google truncates
     * a path to probe for its parent, so each of those URLs invites the probe. `/blog` is the one
     * content hub in every language, so this retires a path that never resolved rather than
     * building a second hub. The sources are exact strings on purpose: a `/guides/:path*` here
     * would 308 all nine indexed guide URLs off themselves.
     *
     * The locale roots are the same 404-parent probe one level up, and `/pt` is `/es` again: a
     * bare language code that never carried a territory, pointed at the hub rather than deindexed.
     */
    async redirects() {
        return [
            { source: '/es/:path*', destination: '/es-419/:path*', permanent: true },
            { source: '/pt/:path*', destination: '/pt-br/:path*', permanent: true },
            { source: '/es-419', destination: '/es-419/blog', permanent: true },
            { source: '/pt-br', destination: '/pt-br/blog', permanent: true },
            { source: '/guides', destination: '/blog', permanent: true },
            { source: '/es-419/guides', destination: '/es-419/blog', permanent: true },
            { source: '/pt-br/guides', destination: '/pt-br/blog', permanent: true },
        ]
    },

    /**
     * `public/` serves files at their exact path only — a directory never resolves to its own
     * index.html. The funnel quiz is one self-contained static file under `public/dev/funnel-quiz/`,
     * and this maps the clean URL onto it. After-files stage, so real files still win.
     */
    async rewrites() {
        return [{ source: '/dev/funnel-quiz', destination: '/dev/funnel-quiz/index.html' }]
    },
}

// Serwist compiles src/app/sw.ts → public/sw.js. Skipped in dev so cold starts
// stay fast and the SW never caches a half-built dev bundle.
if (process.env.NODE_ENV !== 'development') {
    module.exports = async () => {
        const withSerwist = (await import('@serwist/next')).default({
            swSrc: './src/app/sw.ts',
            swDest: 'public/sw.js',
            // Build and precache the product worker, but never register it from Serwist's global
            // client entry: that entry is shared by both Next root layouts. The canonical
            // product shell owns the one explicit registration side effect instead.
            register: false,
            // This default also lives in the shared client entry. The product-only registrar
            // preserves the reload-on-reconnect behavior without attaching it to content pages.
            reloadOnOnline: false,
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
