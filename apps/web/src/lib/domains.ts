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

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]'])

/** Local builds may override the public origin; public deployments may not. */
export const isLoopbackHost = (host: string): boolean => LOOPBACK_HOSTS.has(host.toLowerCase())
