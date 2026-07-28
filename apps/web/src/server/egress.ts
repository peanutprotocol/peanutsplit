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

/** Fields we rely on — structurally satisfied by both fetch implementations,
 *  so callers stay ignorant of which one answered. */
export interface EgressResponse {
    ok: boolean
    status: number
    json(): Promise<unknown>
    text(): Promise<string>
}

export async function egressFetch(
    proxyUrl: string | undefined,
    url: string,
    init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }
): Promise<EgressResponse> {
    if (!proxyUrl) return fetch(url, init)
    const { fetch: undiciFetch, ProxyAgent } = await import('undici')
    // The cast crosses undici's nominal types; the shape above is what we use.
    return undiciFetch(url, { ...init, dispatcher: new ProxyAgent(proxyUrl) } as never) as unknown as EgressResponse
}
