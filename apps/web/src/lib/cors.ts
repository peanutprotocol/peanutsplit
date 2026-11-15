/**
 * Cross-origin access for the store apps. The App Store and Google Play builds load the app from
 * `capacitor://localhost` (iOS) and `https://localhost` (Android) and call the API on
 * `https://peanutsplit.com`, so the server must answer CORS for exactly those two origins.
 *
 * No API route accepts an ambient credential: the room slug in the path is the capability, and a
 * member token travels in a header or the body. Allowing two fixed origins without credentials
 * therefore grants nothing that `curl` with the slug cannot already do. That is why this never sends
 * `Access-Control-Allow-Credentials` and never `*`.
 *
 * The install handoff is the exception: it is bound to a `__Host-` cookie and checks the exact
 * request Origin itself (`src/server/installHandoff.ts`), so it stays same-origin only.
 *
 * Applied in `src/proxy.ts` rather than per route handler, so preflights never reach a handler or a
 * rate-limit bucket, and error responses (429, 403, 500) carry the header too. Without it the app
 * would read a rate limit as an opaque network error.
 */

/** The WebView origins Capacitor 8 uses, the same set peanut-ui allows. */
export const APP_ORIGINS: readonly string[] = ['capacitor://localhost', 'https://localhost']

const CORS_PATH = /^\/api\/|^\/r\/[^/]+\/(?:card\/[a-z]+|recap\/card)$/
const SAME_ORIGIN_ONLY_PATH = /^\/api\/(?:rooms\/[^/]+\/)?install-handoff(?:\/|$)/

export const PREFLIGHT_STATUS = 204

/**
 * The extra origins only the cross-origin e2e harness sets (`SPLIT_CORS_TEST_ORIGINS`, comma
 * separated). Production never sets it. `*` and `null` are dropped so a careless value cannot open
 * the API to every page.
 */
function testOrigins(value: string | undefined): string[] {
    if (!value) return []
    return value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0 && origin !== '*' && origin !== 'null')
}

export type CorsResult = { kind: 'preflight' | 'response'; headers: Record<string, string> }

/**
 * Decides the CORS answer for one request. `null` means "no CORS headers, behave exactly as before":
 * an unknown or missing Origin, a path the apps do not call, or a same-origin-only path.
 */
export function corsFor(
    origin: string | null,
    pathname: string,
    method: string,
    extraOrigins: string | undefined = process.env.SPLIT_CORS_TEST_ORIGINS
): CorsResult | null {
    if (!origin) return null
    if (!APP_ORIGINS.includes(origin) && !testOrigins(extraOrigins).includes(origin)) return null
    if (!CORS_PATH.test(pathname) || SAME_ORIGIN_ONLY_PATH.test(pathname)) return null

    if (method.toUpperCase() === 'OPTIONS') {
        return {
            kind: 'preflight',
            headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
                'Access-Control-Allow-Headers': 'Content-Type, X-Member-Token',
                // WebKit caps the preflight cache at 600 s; a longer value buys nothing.
                'Access-Control-Max-Age': '600',
                Vary: 'Origin',
            },
        }
    }

    return {
        kind: 'response',
        headers: {
            'Access-Control-Allow-Origin': origin,
            // Export downloads name their file in this header; the app reads it to save the file.
            'Access-Control-Expose-Headers': 'Content-Disposition',
            // A shared cache must not serve one origin's answer to another (`/api/currencies` is public).
            Vary: 'Origin',
        },
    }
}
