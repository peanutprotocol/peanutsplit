/**
 * Peanut Split has one public identity: app, PWA and content all live on
 * `peanutsplit.com`. `split.peanut.me` remains only as a compatibility alias while its
 * DNS record exists; it is never used to derive canonical URLs.
 */
export const CANONICAL_HOST = 'peanutsplit.com'
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`
export const CANONICAL_APP_ENTRY = `${CANONICAL_ORIGIN}/app`

export const LEGACY_ALIAS_HOST = 'split.peanut.me'
export const LEGACY_ALIAS_ORIGIN = `https://${LEGACY_ALIAS_HOST}`

/**
 * Next's `assetPrefix`. Every build asset — the product shell, the installed PWA and the content
 * pages alike — is served from under it, so it is a build-namespace constant rather than anything
 * content-specific. `next.config.js` repeats the literal because it is JS and cannot import this.
 */
export const SPLIT_ASSET_PREFIX = '/split-static'

/**
 * Every host that answers as the product: the canonical host, the compatibility alias, and the
 * `www.` form of each. All of them reach the same app, so a link to any of them is a link to the
 * product whatever scheme or port it states. Both the host redirect and the guide link policy
 * read this one set, so the alias list cannot drift between them.
 */
const PRODUCT_HOSTS = new Set([CANONICAL_HOST, `www.${CANONICAL_HOST}`, LEGACY_ALIAS_HOST, `www.${LEGACY_ALIAS_HOST}`])

/**
 * Accepts a raw request `Host` header or a parsed `URL.hostname`; the port, the case and a trailing
 * root dot do not count.
 *
 * `peanutsplit.com.` is the fully qualified spelling of `peanutsplit.com` — same DNS name, same
 * server, and `new URL()` keeps the dot in `hostname` rather than normalising it away. It also
 * survives percent-encoding: `https://peanutsplit.com%2e/new` parses to the same host. Both forms
 * reach the product, so both are the product. Only the single root dot is stripped: `…com..` is not
 * a name anything resolves.
 */
export const isProductHost = (host: string): boolean =>
    PRODUCT_HOSTS.has(host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, ''))

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]'])

/** Local builds may override the public origin; public deployments may not. */
export const isLoopbackHost = (host: string): boolean => LOOPBACK_HOSTS.has(host.toLowerCase())
