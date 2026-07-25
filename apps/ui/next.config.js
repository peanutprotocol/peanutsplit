/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	async rewrites() {
		return [
			{
				// Same-origin proxy to the Split API. Keeps the browser on one
				// origin so devcontainers/previews don't need a second
				// forwarded port for the API to be reachable.
				source: '/_split/:path*',
				destination: `${process.env.SPLIT_API_URL || 'http://localhost:5051'}/split/:path*`,
			},
		]
	},
}

module.exports = nextConfig
