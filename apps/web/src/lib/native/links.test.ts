import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { siteUrl } from '../site'
import type { NativeNav } from './links'

const SLUG = 'ski-trip-kunc-syrup-drum'
const TOKEN_SLUG = 'ski-trip-R7LxQ3TBJV_uQ2PMhzc8rw'

/** A fresh module per test: dispatchNativeLink keeps its last link in module state on purpose. */
async function load() {
    vi.resetModules()
    return import('./links')
}

/** In-memory sessionStorage, so the launch-replay key behaves as in a WebView. */
function fakeSessionStorage(): Storage {
    const values = new Map<string, string>()
    return {
        get length() {
            return values.size
        },
        clear: () => values.clear(),
        getItem: (key) => values.get(key) ?? null,
        key: (index) => [...values.keys()][index] ?? null,
        removeItem: (key) => void values.delete(key),
        setItem: (key, value) => void values.set(key, String(value)),
    }
}

/** A router stand-in that keeps a history stack and the URLs sent to the system browser. */
function fakeNav(start = '/') {
    const history = [start]
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

describe('nativePathForUrl', () => {
    let nativePathForUrl: (input: string) => { path: string } | { external: string } | null
    beforeEach(async () => {
        ;({ nativePathForUrl } = await load())
    })

    it('maps a room link on every product host, and a bare path, to the room screen', () => {
        for (const origin of [
            'https://peanutsplit.com',
            'https://www.peanutsplit.com',
            'https://split.peanut.me',
            'https://www.split.peanut.me',
            'http://peanutsplit.com',
            '',
        ]) {
            expect(nativePathForUrl(`${origin}/r/${SLUG}`)).toEqual({ path: `/room/?slug=${SLUG}` })
        }
        expect(nativePathForUrl(`https://peanutsplit.com/r/${TOKEN_SLUG}/`)).toEqual({
            path: `/room/?slug=${TOKEN_SLUG}`,
        })
        expect(nativePathForUrl(`peanutsplit.com/r/${SLUG}`)).toEqual({ path: `/room/?slug=${SLUG}` })
        expect(nativePathForUrl(`  https://PEANUTSPLIT.COM/r/${SLUG}  `)).toEqual({ path: `/room/?slug=${SLUG}` })
    })

    it('keeps the drawer keys and the fragment, and drops other query keys', () => {
        expect(nativePathForUrl(`https://peanutsplit.com/r/${SLUG}?add=1#x`)).toEqual({
            path: `/room/?slug=${SLUG}&add=1#x`,
        })
        expect(
            nativePathForUrl(
                `/r/${SLUG}?utm_source=wa&expense=e1&shared=1&manage=1&settings=1&fbclid=abc&slug=other-room-abcdef#top`
            )
        ).toEqual({ path: `/room/?slug=${SLUG}&expense=e1&shared=1&manage=1&settings=1#top` })
    })

    it('maps the import tail to the room import screen', () => {
        expect(nativePathForUrl(`https://peanutsplit.com/r/${SLUG}/import`)).toEqual({
            path: `/room/import/?slug=${SLUG}`,
        })
        expect(nativePathForUrl(`/r/${SLUG}/import/?add=1`)).toEqual({ path: `/room/import/?slug=${SLUG}&add=1` })
    })

    it('maps recap, card and any other room sub-path to the room', () => {
        for (const tail of ['/recap', '/card/abc.png', '/recap/card', '/whatever/else']) {
            expect(nativePathForUrl(`https://peanutsplit.com/r/${SLUG}${tail}`)).toEqual({
                path: `/room/?slug=${SLUG}`,
            })
        }
    })

    it('keeps app screens with their query and normalises the trailing slash', () => {
        expect(nativePathForUrl('/app')).toEqual({ path: '/app/' })
        expect(nativePathForUrl('/app/?manage=1')).toEqual({ path: '/app/?manage=1' })
        expect(nativePathForUrl('https://peanutsplit.com/app?add=1')).toEqual({ path: '/app/?add=1' })
        expect(nativePathForUrl('/new?name=Trip&currency=EUR')).toEqual({ path: '/new/?name=Trip&currency=EUR' })
        expect(nativePathForUrl('/new/')).toEqual({ path: '/new/' })
        expect(nativePathForUrl('/import')).toEqual({ path: '/import/' })
        expect(nativePathForUrl(`/room/?slug=${SLUG}&add=1#x`)).toEqual({ path: `/room/?slug=${SLUG}&add=1#x` })
        expect(nativePathForUrl(`/room?slug=${SLUG}`)).toEqual({ path: `/room/?slug=${SLUG}` })
        expect(nativePathForUrl(`/room/import?slug=${SLUG}`)).toEqual({ path: `/room/import/?slug=${SLUG}` })
    })

    it('sends other product pages to the system browser on the configured site origin', () => {
        expect(nativePathForUrl('https://peanutsplit.com/privacy')).toEqual({
            external: `${siteUrl}/privacy`,
        })
        expect(nativePathForUrl('https://split.peanut.me/')).toEqual({ external: `${siteUrl}/` })
        expect(nativePathForUrl('https://www.peanutsplit.com/blog/post?x=1#h')).toEqual({
            external: `${siteUrl}/blog/post?x=1#h`,
        })
        expect(nativePathForUrl('/nope')).toEqual({ external: `${siteUrl}/nope` })
    })

    it('refuses an invalid or missing slug', () => {
        expect(nativePathForUrl('/r/not_a_slug')).toBeNull()
        expect(nativePathForUrl('/r/SKI-TRIP-kunc-syrup-drum')).toBeNull()
        expect(nativePathForUrl('/room/')).toBeNull()
        expect(nativePathForUrl('/room/?slug=')).toBeNull()
        expect(nativePathForUrl('/room/?slug=nope')).toBeNull()
        expect(nativePathForUrl('/room/import/?slug=<script>')).toBeNull()
    })

    it('refuses other hosts, including look-alikes and alias tricks', () => {
        for (const input of [
            `https://evil.example/r/${SLUG}`,
            `https://peanutsplit.com.evil.example/r/${SLUG}`,
            `https://evilpeanutsplit.com/r/${SLUG}`,
            `https://peanut.me/r/${SLUG}`,
            `https://localhost/r/${SLUG}`,
            `https://user:pass@peanutsplit.com/r/${SLUG}`,
            `https://peanutsplit.com@evil.example/r/${SLUG}`,
            'https://evil.example/app',
        ]) {
            expect(nativePathForUrl(input)).toBeNull()
        }
    })

    it('refuses hostile inputs', () => {
        for (const input of [
            'javascript:alert(1)',
            'JavaScript:alert(document.cookie)//https://peanutsplit.com/r/' + SLUG,
            'data:text/html,<script>alert(1)</script>',
            'file:///etc/passwd',
            `capacitor://localhost/r/${SLUG}`,
            '//evil.example',
            `//evil.example/r/${SLUG}`,
            `/\\evil.example/r/${SLUG}`,
            `/r/ski-trip%2Fkunc-syrup-drum`,
            `/r/${SLUG}%2F..%2F..%2Fapp`,
            `/r/%2F%2Fevil.example`,
            '/r/%E0%A4%A',
            '',
            '   ',
            `https://peanutsplit.com/r/${SLUG}?add=1&x=${'a'.repeat(2048)}`,
        ]) {
            expect(nativePathForUrl(input)).toBeNull()
        }
    })

    it('handles a 2 KB input quickly', () => {
        const started = performance.now()
        expect(nativePathForUrl('/r/' + 'a'.repeat(2049))).toBeNull()
        expect(nativePathForUrl('https://peanutsplit.com/' + '/'.repeat(2100))).toBeNull()
        expect(performance.now() - started).toBeLessThan(50)
    })

    it('treats an encoded slash in a non-room path as an ordinary product page', () => {
        // `/r%2F<slug>` is not a room path, so it can only ever open the web page of the same name.
        expect(nativePathForUrl(`https://peanutsplit.com/r%2F${SLUG}`)).toEqual({
            external: `${siteUrl}/r%2F${SLUG}`,
        })
    })
})

describe('roomSlugOfNativePath', () => {
    it('reads the slug of a room or room-import path only', async () => {
        const { roomSlugOfNativePath } = await load()
        expect(roomSlugOfNativePath(`/room/?slug=${SLUG}&add=1#x`)).toBe(SLUG)
        expect(roomSlugOfNativePath(`/room/import/?slug=${SLUG}`)).toBe(SLUG)
        expect(roomSlugOfNativePath('/app/')).toBeNull()
        expect(roomSlugOfNativePath('/room/')).toBeNull()
        expect(roomSlugOfNativePath('/room/?slug=not_a_slug')).toBeNull()
    })

    it('validates the slug a native room screen receives', async () => {
        const { nativeRoomSlug } = await load()
        expect(nativeRoomSlug(SLUG)).toBe(SLUG)
        expect(nativeRoomSlug(TOKEN_SLUG)).toBe(TOKEN_SLUG)
        for (const bad of [null, '', 'nope', `${SLUG}/import`, `../${SLUG}`, `${SLUG}?add=1`, 'a'.repeat(3000)]) {
            expect(nativeRoomSlug(bad)).toBeNull()
        }
    })
})

describe('dispatchNativeLink', () => {
    const LINK = `https://peanutsplit.com/r/${SLUG}?add=1#x`
    const ROOM = `/room/?slug=${SLUG}&add=1#x`

    beforeEach(() => {
        vi.stubGlobal('sessionStorage', fakeSessionStorage())
    })
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('cold start: launch URL then the replayed appUrlOpen within 3 s navigates once, with a replace', async () => {
        const { dispatchNativeLink } = await load()
        const { nav, history } = fakeNav('/')
        expect(dispatchNativeLink(LINK, 'launch', nav, 1_000)).toBe('navigated')
        expect(dispatchNativeLink(LINK, 'open', nav, 2_500)).toBe('duplicate')
        expect(history).toEqual([ROOM])
    })

    it('cold start, reverse order: appUrlOpen first replaces from the root, the launch URL is a duplicate', async () => {
        const { dispatchNativeLink } = await load()
        const { nav, history } = fakeNav('/')
        expect(dispatchNativeLink(LINK, 'open', nav, 1_000)).toBe('navigated')
        expect(dispatchNativeLink(LINK, 'launch', nav, 1_200)).toBe('duplicate')
        expect(history).toEqual([ROOM])
    })

    it('the same link again after more than 3 s on a non-root screen is pushed', async () => {
        const { dispatchNativeLink } = await load()
        const { nav, history } = fakeNav('/')
        dispatchNativeLink(LINK, 'launch', nav, 1_000)
        nav.push('/app/')
        expect(dispatchNativeLink(LINK, 'open', nav, 4_001)).toBe('navigated')
        expect(history).toEqual([ROOM, '/app/', ROOM])
    })

    it('a warm link from a screen is pushed, so back returns to that screen', async () => {
        const { dispatchNativeLink } = await load()
        const { nav, history } = fakeNav('/app/')
        expect(dispatchNativeLink(LINK, 'open', nav, 1_000)).toBe('navigated')
        expect(history).toEqual(['/app/', ROOM])
    })

    it('a launch URL replaces even when the app is already on a screen', async () => {
        const { dispatchNativeLink } = await load()
        const { nav, history } = fakeNav('/app/')
        expect(dispatchNativeLink(LINK, 'launch', nav, 1_000)).toBe('navigated')
        expect(history).toEqual([ROOM])
    })

    it('a launch URL that an earlier page load handled is replayed, not navigated', async () => {
        const first = await load()
        first.dispatchNativeLink(LINK, 'launch', fakeNav('/').nav, 1_000)
        expect(sessionStorage.getItem(first.LAUNCH_HANDLED_KEY)).toBe(LINK)

        // A WebView reload: new module state, same sessionStorage, getLaunchUrl returns the old link.
        const reloaded = await load()
        const { nav, history } = fakeNav('/')
        expect(reloaded.dispatchNativeLink(LINK, 'launch', nav, 60_000)).toBe('replayed')
        expect(history).toEqual(['/'])
        // The same link tapped again while the app runs is a new tap.
        expect(reloaded.dispatchNativeLink(LINK, 'open', nav, 61_000)).toBe('navigated')
        expect(history).toEqual([ROOM])
    })

    it('only a launch writes the replay key', async () => {
        const { dispatchNativeLink, LAUNCH_HANDLED_KEY } = await load()
        dispatchNativeLink(LINK, 'open', fakeNav('/app/').nav, 1_000)
        expect(sessionStorage.getItem(LAUNCH_HANDLED_KEY)).toBeNull()
    })

    it('ignores a link the app cannot map and does not remember it', async () => {
        const { dispatchNativeLink } = await load()
        const { nav, history, external } = fakeNav('/')
        expect(dispatchNativeLink('https://evil.example/r/x', 'launch', nav, 1_000)).toBe('ignored')
        expect(dispatchNativeLink('javascript:alert(1)', 'open', nav, 1_100)).toBe('ignored')
        expect(history).toEqual(['/'])
        expect(external).toEqual([])
        expect(sessionStorage.length).toBe(0)
    })

    it('opens a product page the app lacks in the system browser, and leaves the blank root for home', async () => {
        const { dispatchNativeLink } = await load()
        const { nav, history, external } = fakeNav('/')
        expect(dispatchNativeLink('https://peanutsplit.com/privacy', 'launch', nav, 1_000)).toBe('navigated')
        expect(dispatchNativeLink('https://peanutsplit.com/privacy', 'open', nav, 1_500)).toBe('duplicate')
        expect(external).toEqual([`${siteUrl}/privacy`])
        expect(history).toEqual(['/app/'])
    })

    it('opens an external page from a screen without moving the app', async () => {
        const { dispatchNativeLink } = await load()
        const { nav, history, external } = fakeNav(`/room/?slug=${SLUG}`)
        expect(dispatchNativeLink('https://peanutsplit.com/blog/x', 'open', nav, 1_000)).toBe('navigated')
        expect(external).toEqual([`${siteUrl}/blog/x`])
        expect(history).toEqual([`/room/?slug=${SLUG}`])
    })

    it('still works when sessionStorage throws', async () => {
        vi.stubGlobal('sessionStorage', {
            getItem: () => {
                throw new Error('denied')
            },
            setItem: () => {
                throw new Error('denied')
            },
        })
        const { dispatchNativeLink } = await load()
        const { nav, history } = fakeNav('/')
        expect(dispatchNativeLink(LINK, 'launch', nav, 1_000)).toBe('navigated')
        expect(history).toEqual([ROOM])
    })
})
