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
        return withSerwist(nextConfig)
    }
} else {
    module.exports = nextConfig
}
