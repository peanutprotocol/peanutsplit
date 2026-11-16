import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// URLs the system browser sheet was asked to open.
const browserSheet = vi.hoisted(() => ({ opened: [] as string[] }))

vi.mock('./capacitor/index', () => ({
    browser: {
        open: async (url: string) => {
            browserSheet.opened.push(url)
            return true
        },
    },
}))

const IOS_BASE = 'capacitor://localhost/app/'
const ANDROID_BASE = 'https://localhost/app/'

/** A stand-in for 2C's mapper with the contract's shape: product room links map, other product paths go external. */
function fakeMapper(input: string): { path: string } | { external: string } | null {
    const url = new URL(input, 'https://peanutsplit.com')
    if (url.protocol !== 'https:' || url.hostname !== 'peanutsplit.com') return null
    const room = url.pathname.match(/^\/r\/([a-z0-9-]+)$/)
    if (room) return { path: `/room/?slug=${room[1]}` }
    if (url.pathname === '/app/' || url.pathname === '/app') return { path: '/app/' }
    return { external: `https://peanutsplit.com${url.pathname}` }
}

describe('linkAction', () => {
    it('keeps product room links in the router', async () => {
        const { linkAction } = await import('./external-links')
        expect(linkAction('https://peanutsplit.com/r/ski-trip-kunc-syrup-drum', IOS_BASE, fakeMapper)).toEqual({
            navigate: '/room/?slug=ski-trip-kunc-syrup-drum',
        })
    })

    it('sends other product pages and other hosts to the browser sheet', async () => {
        const { linkAction } = await import('./external-links')
        expect(linkAction('https://peanutsplit.com/privacy', IOS_BASE, fakeMapper)).toEqual({
            open: 'https://peanutsplit.com/privacy',
        })
        expect(linkAction('https://peanut.me/request?x=1', IOS_BASE, fakeMapper)).toEqual({
            open: 'https://peanut.me/request?x=1',
        })
    })

    it('maps in-app paths the bundle does not ship as product paths, on both platforms', async () => {
        const { linkAction } = await import('./external-links')
        expect(linkAction('/privacy', IOS_BASE, fakeMapper)).toEqual({ open: 'https://peanutsplit.com/privacy' })
        expect(linkAction('/privacy', ANDROID_BASE, fakeMapper)).toEqual({ open: 'https://peanutsplit.com/privacy' })
        expect(linkAction('/app/', IOS_BASE, fakeMapper)).toEqual({ navigate: '/app/' })
    })

    it('reads a protocol-relative link as https, never as a capacitor:// host', async () => {
        const { linkAction } = await import('./external-links')
        expect(linkAction('//evil.example/x', IOS_BASE, fakeMapper)).toEqual({ open: 'https://evil.example/x' })
    })

    it('leaves javascript:, mailto:, tel:, blob: and # anchors to the WebView', async () => {
        const { linkAction } = await import('./external-links')
        for (const href of [
            'javascript:alert(1)',
            ' JavaScript:alert(1)',
            'mailto:support@peanut.me',
            'tel:+351000000000',
            'blob:capacitor://localhost/1234',
            'data:text/plain,hi',
            '#top',
        ]) {
            expect(linkAction(href, IOS_BASE, fakeMapper), href).toBeNull()
        }
    })

    it('leaves unmapped in-app links alone', async () => {
        const { linkAction } = await import('./external-links')
        expect(linkAction('/room/?slug=x', IOS_BASE, () => null)).toBeNull()
    })
})

describe('windowOpenTarget', () => {
    it('accepts only absolute http(s) URLs on another host', async () => {
        const { windowOpenTarget } = await import('./external-links')
        expect(windowOpenTarget('https://peanut.me/pay', IOS_BASE)).toBe('https://peanut.me/pay')
        expect(windowOpenTarget(new URL('https://peanut.me/pay'), IOS_BASE)).toBe('https://peanut.me/pay')
        expect(windowOpenTarget('//peanut.me/pay', IOS_BASE)).toBe('https://peanut.me/pay')
        expect(windowOpenTarget('javascript:alert(1)', IOS_BASE)).toBeNull()
        expect(windowOpenTarget('/app/', ANDROID_BASE)).toBeNull()
        expect(windowOpenTarget('/app/', IOS_BASE)).toBeNull()
        expect(windowOpenTarget(undefined, IOS_BASE)).toBeNull()
    })
})

describe('installExternalLinks', () => {
    type Listener = (event: unknown) => void
    let listeners: Array<{ listener: Listener; capture: unknown }>
    let originalOpenCalls: unknown[]
    let fakeWindow: { location: { href: string }; open: (...args: unknown[]) => unknown }

    beforeEach(() => {
        vi.resetModules()
        vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
        browserSheet.opened.length = 0
        listeners = []
        originalOpenCalls = []
        fakeWindow = {
            location: { href: IOS_BASE },
            open: (...args: unknown[]) => {
                originalOpenCalls.push(args)
                return {}
            },
        }
        vi.stubGlobal('window', fakeWindow)
        vi.stubGlobal('document', {
            addEventListener: (_type: string, listener: Listener, capture: unknown) =>
                listeners.push({ listener, capture }),
            removeEventListener: (_type: string, listener: Listener) => {
                listeners = listeners.filter((entry) => entry.listener !== listener)
            },
        })
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    function click(
        href: string | null,
        init: Partial<{ button: number; defaultPrevented: boolean; metaKey: boolean }> = {}
    ) {
        const anchor = { getAttribute: (name: string) => (name === 'href' ? href : null) }
        const event = {
            button: 0,
            defaultPrevented: false,
            ...init,
            target: { closest: (selector: string) => (selector === 'a[href]' && href !== null ? anchor : null) },
            preventDefault() {
                event.defaultPrevented = true
            },
        }
        for (const { listener } of listeners) listener(event)
        return event
    }

    it('opens a foreign link in the browser sheet and stops the WebView from following it', async () => {
        const { installExternalLinks } = await import('./external-links')
        const routed: string[] = []
        installExternalLinks((path) => routed.push(path))
        expect(listeners[0].capture).toBe(true)

        const event = click('https://example.org/help')
        expect(event.defaultPrevented).toBe(true)
        await vi.waitFor(() => expect(browserSheet.opened).toEqual(['https://example.org/help']))
        expect(routed).toEqual([])
    })

    it('ignores mailto:, modified clicks and clicks another handler already took', async () => {
        const { installExternalLinks } = await import('./external-links')
        installExternalLinks(() => {})

        expect(click('mailto:support@peanut.me').defaultPrevented).toBe(false)
        expect(click('https://example.org', { metaKey: true }).defaultPrevented).toBe(false)
        expect(click('https://example.org', { button: 1 }).defaultPrevented).toBe(false)
        click('https://example.org', { defaultPrevented: true })
        expect(click(null).defaultPrevented).toBe(false)
        await Promise.resolve()
        expect(browserSheet.opened).toEqual([])
    })

    it('routes window.open to the browser sheet and returns null; the disposer restores both', async () => {
        const original = fakeWindow.open
        const { installExternalLinks } = await import('./external-links')
        const dispose = installExternalLinks(() => {})

        expect(window.open('https://peanut.me/request/abc', '_blank')).toBeNull()
        expect(window.open('javascript:alert(1)')).toBeNull()
        await vi.waitFor(() => expect(browserSheet.opened).toEqual(['https://peanut.me/request/abc']))
        expect(originalOpenCalls).toEqual([])

        dispose()
        expect(window.open).toBe(original)
        expect(listeners).toEqual([])
    })
})
