/**
 * Which proxy the rate fetch rides.
 *
 * There is one `split-egress` squid instance and several `*_PROXY_URL`
 * variables naming it. Reading only `SPLIT_FX_PROXY_URL` made FX the one
 * consumer that breaks when its variable is missing — and it breaks silently,
 * because `fetchBaseRates` swallows the failure and the table degrades to the
 * twelve static rates. That shipped: USD→ARS served 1030 against a real 1551.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const egressFetch = vi.fn()
vi.mock('@/server/egress', () => ({ egressFetch }))

const PROXY_VARS = [
    'SPLIT_FX_PROXY_URL',
    'SPLIT_SCAN_PROXY_URL',
    'SPLIT_PUSH_PROXY_URL',
    'SPLIT_EMAIL_PROXY_URL',
] as const

const feed = (base: string) =>
    new Response(
        JSON.stringify({
            base,
            basis: 'display_sell',
            indicative: true,
            generatedAt: new Date().toISOString(),
            rates: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
    )

/** The proxy argument `fetchBaseRates` passed on its most recent call. */
const proxyUsed = () => egressFetch.mock.calls.at(-1)?.[0]

beforeEach(() => {
    process.env.SPLIT_FX_MODE = ''
    for (const key of PROXY_VARS) delete process.env[key]
    egressFetch.mockReset()
    egressFetch.mockImplementation(async (_proxy: unknown, url: string) =>
        feed(new URL(url).searchParams.get('base') ?? 'EUR')
    )
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
    for (const key of PROXY_VARS) delete process.env[key]
    vi.restoreAllMocks()
    vi.resetModules()
    process.env.SPLIT_FX_MODE = 'static'
})

describe('egress proxy selection', () => {
    it('prefers the FX-specific variable when it is set', async () => {
        process.env.SPLIT_FX_PROXY_URL = 'http://fx-proxy:3128'
        process.env.SPLIT_SCAN_PROXY_URL = 'http://split-egress:3128'
        const { getRateTable } = await import('@/server/fx')

        await getRateTable('EUR')

        expect(proxyUsed()).toBe('http://fx-proxy:3128')
    })

    it.each([['SPLIT_SCAN_PROXY_URL'], ['SPLIT_PUSH_PROXY_URL'], ['SPLIT_EMAIL_PROXY_URL']])(
        'falls back to %s when the FX variable is absent',
        async (key) => {
            // A Dokploy redeploy that drops SPLIT_FX_PROXY_URL must not put pricing
            // back on the static table — every sibling names the same proxy.
            process.env[key] = 'http://split-egress:3128'
            const { getRateTable } = await import('@/server/fx')

            await getRateTable('EUR')

            expect(proxyUsed()).toBe('http://split-egress:3128')
        }
    )

    it('passes undefined when no proxy is configured, so local dev fetches directly', async () => {
        const { getRateTable } = await import('@/server/fx')

        await getRateTable('EUR')

        expect(proxyUsed()).toBeUndefined()
    })
})
