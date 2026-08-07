/**
 * The one way out of the container.
 *
 * The prod network is default-deny; every runtime fetch to the outside world
 * rides the pinned squid proxy via an undici ProxyAgent. The trap this module
 * exists for: Next patches global `fetch`, and the `dispatcher` option does not
 * survive its wrapper — in production the call died with a bare TypeError while
 * the same request succeeded from a raw container (2026-07-28, the first real
 * scan). So when a proxy is configured we bypass the patched global entirely
 * and use undici's own `fetch`, which takes its own dispatcher natively.
 *
 * No proxy configured (local dev) → the plain global fetch, untouched.
 */
// Type-only, so undici stays a runtime import that never loads without a proxy.
import type { ProxyAgent } from 'undici'

/** Fields we rely on — structurally satisfied by both fetch implementations,
 *  so callers stay ignorant of which one answered. */
export interface EgressResponse {
    ok: boolean
    status: number
    json(): Promise<unknown>
}

/**
 * One agent per proxy URL, for the lifetime of the process.
 *
 * A ProxyAgent owns a keep-alive connection pool, so building one per request
 * meant a fresh pool per scan and per email — sockets opened, never reused, and
 * left for the GC to close. The URL is the whole of an agent's identity here, so
 * the key is the URL.
 */
const agents = new Map<string, ProxyAgent>()

/**
 * `init` is a plain RequestInit and the result is a full `Response` so a caller
 * that streams the body with a byte ceiling (the FX rate table) can use this
 * too, not only the JSON-shaped POSTs. `Response` structurally satisfies
 * `EgressResponse`, so existing callers are unaffected.
 */
export async function egressFetch(proxyUrl: string | undefined, url: string, init: RequestInit): Promise<Response> {
    if (!proxyUrl) return fetch(url, init)
    const { fetch: undiciFetch, ProxyAgent } = await import('undici')
    let agent = agents.get(proxyUrl)
    if (!agent) {
        agent = new ProxyAgent(proxyUrl)
        agents.set(proxyUrl, agent)
    }
    // The cast crosses undici's nominal types; the shape above is what we use.
    return undiciFetch(url, { ...init, dispatcher: agent } as never) as unknown as Response
}
