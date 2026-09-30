import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLICK_ID_KEY, OCT_SRC, X_ROOM_CREATED_PIXEL, readClickId } from './x-ads'

type FakeWindow = {
    location: { hostname: string; href: string; search: string }
    sessionStorage: Pick<Storage, 'getItem' | 'setItem'>
    twttr?: { conversion?: { trackPid: (...args: unknown[]) => void } }
}

function fakeBrowser(href: string, stored = new Map<string, string>()) {
    const url = new URL(href)
    const head = { appendChild: vi.fn() }
    const window: FakeWindow = {
        location: { hostname: url.hostname, href, search: url.search },
        sessionStorage: {
            getItem: (key) => stored.get(key) ?? null,
            setItem: (key, value) => void stored.set(key, value),
        },
    }
    const document = {
        getElementById: vi.fn(() => null),
        createElement: vi.fn(() => ({}) as Record<string, unknown>),
        head,
    }
    vi.stubGlobal('window', window)
    vi.stubGlobal('document', document)
    return { window, document, head, stored }
}

/** What oct.js puts on the page once it has loaded. */
function loadOct(window: FakeWindow) {
    const trackPid = vi.fn()
    window.twttr = { conversion: { trackPid } }
    return trackPid
}

beforeEach(() => {
    vi.resetModules()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('the click id', () => {
    it('is read from the landing URL and nothing else is', () => {
        expect(readClickId('?twclid=2-7gd0bxa1lw0c4e&utm_source=x')).toBe('2-7gd0bxa1lw0c4e')
        expect(readClickId('?name=Ski%20trip')).toBeNull()
        expect(readClickId('')).toBeNull()
    })

    it('is dropped when it is not shaped like one', () => {
        expect(readClickId('?twclid=%3Cscript%3E')).toBeNull()
        expect(readClickId(`?twclid=${'a'.repeat(300)}`)).toBeNull()
    })
})

describe('the tag is the product host only', () => {
    it('loads oct.js over https on peanutsplit.com, once', async () => {
        const { document, head } = fakeBrowser('https://peanutsplit.com/')
        const { initXAds } = await import('./x-ads')
        initXAds()

        expect(head.appendChild).toHaveBeenCalledOnce()
        expect(head.appendChild.mock.calls[0][0]).toMatchObject({ src: OCT_SRC, async: true })
        expect(OCT_SRC.startsWith('https://')).toBe(true)

        document.getElementById.mockReturnValue({} as never)
        initXAds()
        expect(head.appendChild).toHaveBeenCalledOnce()
    })

    it('stays silent on a fork, a preview host and a dev box', async () => {
        for (const href of ['http://localhost:3000/?twclid=abc', 'https://split.example.test/?twclid=abc']) {
            vi.resetModules()
            const { window, head, stored } = fakeBrowser(href)
            const trackPid = loadOct(window)
            const { initXAds, trackXRoomCreatedConversion } = await import('./x-ads')
            initXAds()
            trackXRoomCreatedConversion()

            expect(head.appendChild).not.toHaveBeenCalled()
            expect(stored.size).toBe(0)
            expect(trackPid).not.toHaveBeenCalled()
        }
    })
})

describe('the room-created conversion', () => {
    it('sends the pixel with the page location hidden, and nothing about the room', async () => {
        const { window } = fakeBrowser('https://peanutsplit.com/new?name=Ski%20trip%20with%20Ana&currency=EUR')
        const { initXAds, trackXRoomCreatedConversion } = await import('./x-ads')
        initXAds()
        const trackPid = loadOct(window)
        trackXRoomCreatedConversion()

        expect(trackPid).toHaveBeenCalledWith(X_ROOM_CREATED_PIXEL, {
            tw_sale_amount: 0,
            tw_order_quantity: 0,
            hide_page_location: true,
        })
    })

    it('carries the landing click id to a room created on /new', async () => {
        const stored = new Map<string, string>()
        fakeBrowser('https://peanutsplit.com/?twclid=2-7gd0bxa1lw0c4e', stored)
        const landing = await import('./x-ads')
        landing.initXAds()
        expect(stored.get(CLICK_ID_KEY)).toBe('2-7gd0bxa1lw0c4e')

        vi.resetModules()
        const { window } = fakeBrowser('https://peanutsplit.com/new', stored)
        const trackPid = loadOct(window)
        const { initXAds, trackXRoomCreatedConversion } = await import('./x-ads')
        initXAds()
        trackXRoomCreatedConversion()

        expect(trackPid.mock.calls[0][1]).toMatchObject({ twclid: '2-7gd0bxa1lw0c4e', hide_page_location: true })
    })

    it('is a no-op when oct.js never loaded', async () => {
        fakeBrowser('https://peanutsplit.com/new')
        const { trackXRoomCreatedConversion } = await import('./x-ads')
        expect(() => trackXRoomCreatedConversion()).not.toThrow()
    })

    it('never throws, whatever oct.js or storage does', async () => {
        const { window } = fakeBrowser('https://peanutsplit.com/?twclid=abc')
        window.sessionStorage = {
            getItem: () => {
                throw new Error('blocked')
            },
            setItem: () => {
                throw new Error('blocked')
            },
        }
        window.twttr = {
            conversion: {
                trackPid: () => {
                    throw new Error('oct.js broke')
                },
            },
        }
        const { initXAds, trackXRoomCreatedConversion } = await import('./x-ads')
        expect(() => initXAds()).not.toThrow()
        expect(() => trackXRoomCreatedConversion()).not.toThrow()
    })
})
