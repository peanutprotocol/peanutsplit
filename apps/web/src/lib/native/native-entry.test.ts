import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeNav } from './links'

const SLUG = 'ski-trip-kunc-syrup-drum'
const LINK = `https://peanutsplit.com/r/${SLUG}`
const ROOM = `/room/?slug=${SLUG}`
const OTHER_SLUG = 'beach-house-mint-tide-oak'

/**
 * Loads the store-app build of both modules: `roomPath` reads the build flag at import, and
 * `dispatchNativeLink` keeps its last link in module state, so every test gets fresh copies.
 */
async function load() {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
    const entry = await import('./native-entry')
    const links = await import('./links')
    return { ...entry, ...links }
}

function fakeSessionStorage(): Pick<Storage, 'getItem' | 'setItem'> {
    const values = new Map<string, string>()
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) }
}

function fakeNav() {
    const history = ['/']
    const external: string[] = []
    const nav: NativeNav = {
        currentPath: () => new URL(history[history.length - 1], 'https://localhost').pathname,
        replace: (p) => {
            history[history.length - 1] = p
        },
        push: (p) => {
            history.push(p)
        },
        openExternal: (u) => {
            external.push(u)
        },
    }
    return { nav, history, external }
}

/** Records which inputs decideEntry consulted, to prove the order. */
function inputs(
    nav: NativeNav,
    {
        bootPath = '/',
        launchUrl = null,
        tap = null,
    }: { bootPath?: string; launchUrl?: string | null; tap?: { slug: string; sendId: string } | null }
) {
    const consulted: string[] = []
    return {
        consulted,
        value: {
            bootPath,
            nav,
            getLaunchUrl: async () => {
                consulted.push('launch')
                return launchUrl
            },
            awaitColdPushTap: async () => {
                consulted.push('push')
                return tap
            },
        },
    }
}

describe('decideEntry', () => {
    beforeEach(() => {
        vi.stubGlobal('sessionStorage', fakeSessionStorage())
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
    })

    it('restores a non-root boot path before anything else', async () => {
        const { decideEntry } = await load()
        const { nav, history } = fakeNav()
        const run = inputs(nav, {
            bootPath: `/room/?slug=${SLUG}&add=1#x`,
            launchUrl: `https://peanutsplit.com/r/${OTHER_SLUG}`,
            tap: { slug: OTHER_SLUG, sendId: 's1' },
        })
        expect(await decideEntry(run.value)).toEqual({ step: 'boot', path: `/room/?slug=${SLUG}&add=1#x` })
        expect(history).toEqual([`/room/?slug=${SLUG}&add=1#x`])
        expect(run.consulted).toEqual([])
    })

    it('restores the rooms list with its query after a reload', async () => {
        const { decideEntry } = await load()
        const { nav, history } = fakeNav()
        await decideEntry(inputs(nav, { bootPath: '/app/?manage=1' }).value)
        expect(history).toEqual(['/app/?manage=1'])
    })

    it('sends an unknown or web-only boot path home and never opens a browser', async () => {
        for (const bootPath of ['/nope', '/privacy', '/blog/x', '/r/not-a-slug', '/room/?slug=bad']) {
            const { decideEntry } = await load()
            const { nav, history, external } = fakeNav()
            expect(await decideEntry(inputs(nav, { bootPath, launchUrl: LINK }).value)).toEqual({
                step: 'boot',
                path: '/app/',
            })
            expect(history).toEqual(['/app/'])
            expect(external).toEqual([])
        }
    })

    it('opens the launch link before the push tap and home', async () => {
        const { decideEntry } = await load()
        const { nav, history } = fakeNav()
        const run = inputs(nav, { launchUrl: LINK, tap: { slug: OTHER_SLUG, sendId: 's1' } })
        expect(await decideEntry(run.value)).toEqual({ step: 'launch', url: LINK, result: 'navigated' })
        expect(history).toEqual([ROOM])
        expect(run.consulted).toEqual(['launch'])
    })

    it('stops when the replayed appUrlOpen already navigated (reverse order), with no fall-through home', async () => {
        const { decideEntry, dispatchNativeLink } = await load()
        const { nav, history } = fakeNav()
        // The appUrlOpen listener mounts in NativeShell and may take the retained event first.
        expect(dispatchNativeLink(LINK, 'open', nav)).toBe('navigated')
        const run = inputs(nav, { launchUrl: LINK })
        expect(await decideEntry(run.value)).toEqual({ step: 'launch', url: LINK, result: 'duplicate' })
        expect(history).toEqual([ROOM])
        expect(run.consulted).toEqual(['launch'])
    })

    it('makes one navigation when the launch URL comes first and appUrlOpen replays it', async () => {
        const { decideEntry, dispatchNativeLink } = await load()
        const { nav, history } = fakeNav()
        await decideEntry(inputs(nav, { launchUrl: LINK }).value)
        expect(dispatchNativeLink(LINK, 'open', nav)).toBe('duplicate')
        expect(history).toEqual([ROOM])
    })

    it('moves on to the push tap when the launch URL is a replay from an earlier page load', async () => {
        const first = await load()
        await first.decideEntry(inputs(fakeNav().nav, { launchUrl: LINK }).value)

        const reloaded = await load()
        const { nav, history } = fakeNav()
        const run = inputs(nav, { launchUrl: LINK, tap: { slug: OTHER_SLUG, sendId: 's2' } })
        expect(await reloaded.decideEntry(run.value)).toEqual({ step: 'push', slug: OTHER_SLUG, sendId: 's2' })
        expect(history).toEqual([`/room/?slug=${OTHER_SLUG}`])
        expect(run.consulted).toEqual(['launch', 'push'])
    })

    it('moves on to the push tap when the launch URL cannot be mapped', async () => {
        const { decideEntry } = await load()
        const { nav, history, external } = fakeNav()
        const run = inputs(nav, { launchUrl: 'https://evil.example/x', tap: { slug: OTHER_SLUG, sendId: 's3' } })
        expect((await decideEntry(run.value)).step).toBe('push')
        expect(history).toEqual([`/room/?slug=${OTHER_SLUG}`])
        expect(external).toEqual([])
    })

    it('goes home when there is no boot path, no launch link and no push tap', async () => {
        const { decideEntry } = await load()
        const { nav, history } = fakeNav()
        const run = inputs(nav, {})
        expect(await decideEntry(run.value)).toEqual({ step: 'home' })
        expect(history).toEqual(['/app/'])
        expect(run.consulted).toEqual(['launch', 'push'])
    })

    it('treats an empty boot path like the root', async () => {
        const { decideEntry } = await load()
        const { nav, history } = fakeNav()
        await decideEntry({ ...inputs(nav, {}).value, bootPath: undefined })
        expect(history).toEqual(['/app/'])
    })
})
