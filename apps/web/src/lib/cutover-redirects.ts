/**
 * The host-aware redirect decision for the domain cutover, as a pure function so the
 * table of cases lives in a unit test rather than in a deployed middleware.
 *
 * The split: app intent serves on `split.peanut.me`, marketing/content intent stays on
 * `peanutsplit.com` (see `docs/SEO-DOMAIN-DECISIONS.md`). The same build answers both
 * hostnames, so each host bounces the other host's half across — 302, not 301, because
 * the content half of the story is still moving and a cached 301 cannot be taken back.
 *
 * Three deliberate properties:
 *
 *  - **Only the two production hosts ever redirect.** localhost, `0.0.0.0` (what the
 *    standalone container sees), preview deploys and e2e all fall through untouched, so
 *    this code is safe to ship before DNS for the new host even exists.
 *  - **Targets are built from `domains.ts`, never from the request.** Behind the
 *    standalone container `request.url`'s origin is `0.0.0.0:3000` — the trap
 *    `api/share-target` documents.
 *  - **When the build is not cut over** (`CANONICAL_APP_HOST` equals the legacy host,
 *    i.e. `NEXT_PUBLIC_BASE_URL` still points at peanutsplit.com) **nothing redirects.**
 *    Otherwise the legacy host would bounce app paths to itself, forever.
 */
import { CANONICAL_APP_HOST, isLoopbackHost, LEGACY_APP_HOST } from './domains'

export interface CutoverRedirect {
    target: string
    status: 302
}

/**
 * The app surface: the routes a room link, a launcher icon or a mid-import person is
 * actually using. `/r/*` (rooms), `/app` (the operational home), `/new` (room creation)
 * and `/import` (Splitwise import — filed under `(marketing)` for its landing copy, but
 * what it does is app work). Everything else the matcher lets through is marketing.
 */
const APP_PATHS = new Set(['/app', '/new', '/import'])
const isAppPath = (pathname: string): boolean => APP_PATHS.has(pathname) || pathname.startsWith('/r/')

/**
 * Paths neither host may redirect, in either direction:
 *
 *  - `/handoff` — the localStorage bridge. The new origin iframes the OLD origin's copy;
 *    a redirect would collapse the two origins into one and hand the iframe its own
 *    empty storage.
 *  - `/share-target` — the installed-PWA share landing. The shared photo is parked in
 *    the ORIGIN-BOUND Cache API by the service worker; sending the page to the other
 *    origin would lose the receipt mid-share.
 *  - `/healthcheck`, `/readiness` — probes must answer on whatever host asked.
 *  - `/dev-ds` — the design-system workbench; not marketing, not user-facing.
 */
const EXEMPT_PATHS = new Set(['/handoff', '/share-target', '/healthcheck', '/readiness'])
const isExempt = (pathname: string): boolean => EXEMPT_PATHS.has(pathname) || pathname.startsWith('/dev-ds')

const bareHost = (host: string): string => host.trim().toLowerCase().replace(/:\d+$/, '')

/**
 * Decide the cutover redirect for one request, or `null` to serve it where it landed.
 * `search` is the raw query string (`?a=b` or empty) and is preserved on every bounce —
 * a room link's `?from=group-chat` decoration survives the hop.
 *
 * The host pair is a parameter only so the test can pin production values; callers use
 * {@link cutoverRedirect}, which binds the real ones.
 */
export function decideCutoverRedirect(
    host: string,
    pathname: string,
    search: string,
    legacyHost: string,
    canonicalHost: string
): CutoverRedirect | null {
    if (legacyHost === canonicalHost) return null
    // Dev and e2e set `NEXT_PUBLIC_BASE_URL=http://localhost:<port>`, which makes the
    // DERIVED canonical host `localhost`; without this check that build would treat
    // localhost as a production host and bounce every local marketing page to
    // peanutsplit.com.
    if (isLoopbackHost(canonicalHost)) return null

    const bare = bareHost(host)
    const onLegacy = bare === legacyHost || bare === `www.${legacyHost}`
    const onCanonical = bare === canonicalHost || bare === `www.${canonicalHost}`
    if (!onLegacy && !onCanonical) return null
    if (isExempt(pathname)) return null

    if (onLegacy) {
        // App intent has moved. Marketing (and anything unrecognised) stays here.
        return isAppPath(pathname) ? { target: `https://${canonicalHost}${pathname}${search}`, status: 302 } : null
    }

    // Canonical host: the app serves; everything else — marketing pages, locale
    // prefixes, unknown slugs — bounces back so no content is duplicated on the
    // subdomain while its canonicals are still being sorted out.
    return isAppPath(pathname) ? null : { target: `https://${legacyHost}${pathname}${search}`, status: 302 }
}

/** {@link decideCutoverRedirect} bound to the production host pair from `domains.ts`. */
export function cutoverRedirect(host: string, pathname: string, search: string): CutoverRedirect | null {
    return decideCutoverRedirect(host, pathname, search, LEGACY_APP_HOST, CANONICAL_APP_HOST)
}
