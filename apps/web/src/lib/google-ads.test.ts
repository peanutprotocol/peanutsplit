import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GOOGLE_ADS_ID, ROOM_CREATED_LABEL, reportableReferrer, reportableUrl } from './google-ads'

type FakeWindow = {
    location: { hostname: string; href: string; origin: string }
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
}

function fakeBrowser(href: string) {
    const url = new URL(href)
    const head = { appendChild: vi.fn() }
    const window: FakeWindow = {
        location: { hostname: url.hostname, href, origin: url.origin },
    }
    const document = {
        referrer: '',
        getElementById: vi.fn(() => null),
        createElement: vi.fn(() => ({}) as Record<string, unknown>),
        head,
    }
    vi.stubGlobal('window', window)
    vi.stubGlobal('document', document)
    return { window, document, head }
}

beforeEach(() => {
    vi.resetModules()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('reportable page context', () => {
    it('keeps the click ids and campaign labels a conversion is matched on', () => {
        expect(reportableUrl('https://peanutsplit.com/?gclid=abc123&utm_source=google&utm_medium=cpc')).toBe(
            'https://peanutsplit.com/?gclid=abc123&utm_source=google&utm_medium=cpc'
        )
        expect(reportableUrl('https://peanutsplit.com/new?gbraid=g1&wbraid=w1&gad_source=1')).toBe(
            'https://peanutsplit.com/new?gbraid=g1&wbraid=w1&gad_source=1'
        )
    })

    it('drops the room prefill a template link puts on /new', () => {
        expect(
            reportableUrl('https://peanutsplit.com/new?name=Ski%20trip%20with%20Ana&currency=EUR&gclid=abc123')
        ).toBe('https://peanutsplit.com/new?gclid=abc123')
    })

    it('never reports a room slug or a fragment', () => {
        expect(reportableUrl('https://peanutsplit.com/r/ski-trip-x7k2m9?roster=1#top')).toBe(
            'https://peanutsplit.com/r/[slug]'
        )
    })

    it('reports an external referrer and swallows our own', () => {
        expect(reportableReferrer('https://www.google.com/search?q=split+bills', 'https://peanutsplit.com')).toBe(
            'https://www.google.com/search'
        )
        expect(reportableReferrer('https://peanutsplit.com/r/ski-trip-x7k2m9', 'https://peanutsplit.com')).toBe('')
        expect(reportableReferrer('', 'https://peanutsplit.com')).toBe('')
        expect(reportableReferrer('not-a-url', 'https://peanutsplit.com')).toBe('')
    })
})

describe('the tag is the product host only', () => {
    it('loads gtag and configures the account on peanutsplit.com', async () => {
        const { window, head } = fakeBrowser('https://peanutsplit.com/?gclid=abc123')
        const { initGoogleAds } = await import('./google-ads')
        initGoogleAds()

        expect(head.appendChild).toHaveBeenCalledOnce()
        const calls = (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>))
        expect(calls[0][0]).toBe('js')
        expect(calls[1]).toMatchObject([
            'config',
            GOOGLE_ADS_ID,
            { send_page_view: false, page_location: 'https://peanutsplit.com/?gclid=abc123', page_referrer: '' },
        ])
    })

    it('stays silent on a fork, a preview host and a dev box', async () => {
        for (const href of ['http://localhost:3000/', 'https://split.example.test/']) {
            vi.resetModules()
            const { window, head } = fakeBrowser(href)
            const { initGoogleAds, trackRoomCreatedConversion } = await import('./google-ads')
            initGoogleAds()
            trackRoomCreatedConversion()

            expect(head.appendChild).not.toHaveBeenCalled()
            expect(window.dataLayer).toBeUndefined()
        }
    })
})

describe('the room-created conversion', () => {
    it('sends the account and label, and nothing about the room', async () => {
        const { window } = fakeBrowser('https://peanutsplit.com/new')
        const { initGoogleAds, trackRoomCreatedConversion } = await import('./google-ads')
        initGoogleAds()
        window.dataLayer = []
        trackRoomCreatedConversion()

        const sent = Array.from(window.dataLayer[0] as ArrayLike<unknown>)
        expect(sent).toEqual(['event', 'conversion', { send_to: `${GOOGLE_ADS_ID}/${ROOM_CREATED_LABEL}` }])
    })

    it('is a no-op when the tag was never mounted', async () => {
        fakeBrowser('https://peanutsplit.com/new')
        const { trackRoomCreatedConversion } = await import('./google-ads')
        expect(() => trackRoomCreatedConversion()).not.toThrow()
    })
})
