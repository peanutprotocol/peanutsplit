/**
 * Which push-service URLs we are willing to store and later POST to.
 *
 * A subscribe endpoint takes an arbitrary URL from an arbitrary caller and the
 * server then makes a request to it — that is a server-side request forgery
 * primitive handed over on a plate. Restricting it to the four real push
 * services means the worst a forged body can do is make us talk to Google.
 *
 * Pure on purpose: no Prisma, no Request, so the allowlist can be tested as the
 * table of hostnames it actually is.
 */

/** Exact hosts. FCM and Mozilla each publish a single endpoint host. */
const EXACT_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com'])

/** Suffixes. WNS and Apple shard across per-region subdomains, so the host is
 *  matched by parent domain — with the leading dot, so `evilpush.apple.com` is
 *  the only shape that matches and `notapple.com` is not. */
const HOST_SUFFIXES = ['.notify.windows.com', '.push.apple.com']

export function isAllowedPushEndpoint(endpoint: string): boolean {
    let url: URL
    try {
        url = new URL(endpoint)
    } catch {
        return false
    }
    // Plain http would mean shipping the encrypted payload plus our VAPID
    // assertion over the wire in clear.
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    if (EXACT_HOSTS.has(host)) return true
    return HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
}
