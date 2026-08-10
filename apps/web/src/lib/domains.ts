/**
 * The two hostnames of the domain cutover (2026-08: peanutsplit.com → split.peanut.me),
 * in one place so every redirect, handoff message and banner agrees on them.
 *
 * The legacy host is a literal — it is history, not configuration. The canonical host is
 * derived from `siteUrl`, so it follows the deploy's `NEXT_PUBLIC_BASE_URL` the same way
 * canonicals and OG cards already do. A build that is not cut over resolves the two to
 * the SAME host (env unset) or to a loopback host (dev and e2e set
 * `http://localhost:<port>`), and everything keyed on them — redirects, the handoff
 * iframe, the reinstall banner — checks for both and stays inert on purpose.
 */
import { siteUrl } from './site'

export const LEGACY_APP_HOST = 'peanutsplit.com'
export const LEGACY_APP_ORIGIN = `https://${LEGACY_APP_HOST}`

export const CANONICAL_APP_HOST = new URL(siteUrl).hostname
export const CANONICAL_APP_ORIGIN = `https://${CANONICAL_APP_HOST}`
/** The operational launcher destination. The canonical origin's bare `/` is
 *  intentionally marketing-routed back to peanutsplit.com. */
export const CANONICAL_APP_ENTRY = `${CANONICAL_APP_ORIGIN}/app`

/**
 * `localhost`, `127.0.0.1`, `0.0.0.0` — a host a production build would never call
 * itself. The cutover machinery treats a loopback-ish canonical host as "not cut over".
 */
export const isLoopbackHost = (host: string): boolean => !host.includes('.') || /^\d+(\.\d+){3}$/.test(host)
