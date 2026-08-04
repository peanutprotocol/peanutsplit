import { request } from '@playwright/test'

/**
 * Compile every route the suite opens, once, before any test starts.
 *
 * The webServer is `next dev`, which compiles a route the first time something asks for it. The
 * config only waits on `/healthcheck`, so the first test to reach `/`, `/app`, `/new` or `/import`
 * pays for that route's compile inside its own 30s budget — and with the suite running many
 * workers at once, several of those first touches land together and queue behind each other. The
 * result is a navigation or reload that times out on a page which is merely still building, which
 * reads as a flake and is really a cold start.
 *
 * Warming them here moves that cost out of the tests and into one serial pass that nothing is
 * timing. It is not a sleep: each request returns when its route is genuinely compiled and served.
 */
const ROUTES = ['/', '/app', '/new', '/import']

export default async function globalSetup(): Promise<void> {
    const port = Number(process.env.E2E_PORT ?? 3100)
    const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`

    const api = await request.newContext({
        baseURL,
        // The warmup must not spend any test's creation budget, and it must not look like the
        // fallback client either — see `e2e/fixtures.ts` on why one shared address is the bug.
        extraHTTPHeaders: { 'x-forwarded-for': '10.255.255.254' },
    })
    try {
        for (const route of ROUTES) {
            // Sequential on purpose: parallel cold compiles are the thing being avoided, not caused.
            await api.get(route, { timeout: 180_000 }).catch(() => undefined)
        }

        // The room and its share card need a real slug to compile against, so the warmup makes one
        // room of its own. `/r/[slug]/card/[kind]` renders a 1200×630 PNG and is the slowest route
        // in the app to build: the invite-share spec waits 20s for it inside a 30s budget, which a
        // cold compile alone can exhaust.
        const created = await api
            .post('/api/rooms', { data: { name: 'Warmup', currency: 'EUR', creatorName: 'Ana' } })
            .catch(() => null)
        const slug = created?.ok() ? ((await created.json()) as { room?: { slug?: string } }).room?.slug : undefined
        if (slug) {
            await api.get(`/r/${slug}`, { timeout: 180_000 }).catch(() => undefined)
            // Existing-room import is a nested dynamic route and has its own
            // client tree. Compile it against the same disposable room before
            // an append journey starts its test clock.
            await api.get(`/r/${slug}/import`, { timeout: 180_000 }).catch(() => undefined)
            await api.get(`/r/${slug}/card/invite`, { timeout: 180_000 }).catch(() => undefined)
        }
    } finally {
        await api.dispose()
    }
}
