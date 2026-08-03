import { test as base, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test'

/**
 * One client IP per browser context, so the server's rate limiter can never make one test fail for
 * something another test did.
 *
 * `src/server/rateLimit.ts` meters room and member creation at CREATE_LIMIT — 20 an hour, keyed on
 * the first `x-forwarded-for` hop. Most tests here create a room, so a single shared address
 * drains that bucket within the first minute of a run and every later creation answers 429: "That
 * was a lot of requests — give it a minute and try again." The room screen renders that as an
 * alert instead of a room, so the test fails on a missing element and reads like a wait/race. It
 * is not one — it is a budget, and which tests land inside it depends on worker count, file order,
 * and how recently the suite last ran. That is the whole "passes on retry" signature: retries
 * wait, and the bucket refills at one token every three minutes.
 *
 * The config used to pin one address per project, which only separated the two projects from each
 * other. Per context is the property that actually holds: a fresh 20-token allowance for every
 * device in every test, so nothing can be starved by its neighbours or by the previous run.
 */

/**
 * A private-range address, drawn fresh every time.
 *
 * Three random octets is ~16.7M addresses. A whole run draws a few hundred, so the chance any two
 * collide is well under 1%, and a re-run never inherits the budget the last one spent. Randomness
 * rather than an index because this has to work in `beforeAll` too, where no test index exists.
 */
export function uniqueClientIp(): string {
    const octet = () => Math.floor(Math.random() * 256)
    return `10.${octet()}.${octet()}.${1 + Math.floor(Math.random() * 254)}`
}

/**
 * Context options for a device that owns its creation budget.
 *
 * `browser.newContext()` takes NONE of the config's `use` options, so a context built by hand
 * sends no `x-forwarded-for` at all and the server files it under one fallback key. Every
 * hand-built context in the suite therefore shared a single 20-token creation budget — a worse
 * version of the problem the per-test address solves, and the reason the two-device specs broke
 * first: joining a room creates a member, which is metered.
 */
export function deviceContext(options: BrowserContextOptions = {}): BrowserContextOptions {
    return {
        viewport: { width: 390, height: 844 },
        ...options,
        extraHTTPHeaders: { 'x-forwarded-for': uniqueClientIp(), ...options.extraHTTPHeaders },
    }
}

/** Open a second device — its own context, its own identity storage, its own creation budget. */
export type NewDevice = (options?: BrowserContextOptions) => Promise<Page>

interface SplitFixtures {
    /** The address this test's own browser context presents. */
    clientIp: string
    newDevice: NewDevice
}

export const test = base.extend<SplitFixtures>({
    clientIp: async ({}, use) => {
        await use(uniqueClientIp())
    },

    context: async ({ context, clientIp }, use) => {
        // Set on the context rather than through the `extraHTTPHeaders` option so a spec keeps the
        // ordinary `test.use` escape hatch for any OTHER header without having to restate this one.
        await context.setExtraHTTPHeaders({ 'x-forwarded-for': clientIp })
        await use(context)
    },

    /**
     * The API context a spec uses to seed rooms is the SAME device as the page, so it presents the
     * same address and draws on one allowance rather than two.
     *
     * It has to be stated here: `request` builds itself from the `extraHTTPHeaders` OPTION, which
     * the config no longer sets, and `context.setExtraHTTPHeaders` above reaches only the browser.
     * Left alone, every `request` in the suite would go out unidentified and share the single
     * fallback bucket — which is the original bug wearing a different hat, and it lands hardest on
     * the specs that seed their fixtures through the API.
     */
    request: async ({ playwright, baseURL, clientIp }, use) => {
        const api = await playwright.request.newContext({
            baseURL,
            extraHTTPHeaders: { 'x-forwarded-for': clientIp },
        })
        await use(api)
        await api.dispose()
    },

    newDevice: async ({ browser }, use) => {
        const opened: BrowserContext[] = []
        const open: NewDevice = async (options) => {
            const context = await browser.newContext(deviceContext(options))
            opened.push(context)
            return context.newPage()
        }
        await use(open)
        await Promise.all(opened.map((context) => context.close()))
    },
})

/** For `beforeAll`, where test-scoped fixtures do not reach. */
export async function openDevice(browser: Browser, options?: BrowserContextOptions): Promise<Page> {
    const context = await browser.newContext(deviceContext(options))
    return context.newPage()
}

export { expect } from '@playwright/test'
