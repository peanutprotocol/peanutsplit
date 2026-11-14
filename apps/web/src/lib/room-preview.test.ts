import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fillMetadataSegment } from 'next/dist/lib/metadata/get-metadata-route'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prewarmRoomPreview, roomPreviewImagePath } from './room-preview'

/**
 * The bug these cover: the app used to build `/r/<slug>/opengraph-image` itself,
 * which is not a URL Next serves — every warm was a 404 in the console and every
 * shared room unfurled imageless. The URL is now whatever the document says it
 * is, so what is worth pinning is that this fetches THAT, and nothing else.
 */
const png = () =>
    new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
    })

/** A document that advertises `image` from the page served at `baseURI`. */
const docAdvertising = (image: string | null, baseURI = 'https://peanutsplit.com/r/ski-trip-a_b-123') => ({
    baseURI,
    querySelector: (selectors: string) =>
        selectors === 'meta[property="og:image"]' && image ? { getAttribute: () => image } : null,
})

describe('room social-preview prewarm', () => {
    it('fetches the hashed URL the document advertises and consumes it', async () => {
        const response = png()
        const arrayBuffer = vi.spyOn(response, 'arrayBuffer')
        const fetcher = vi.fn(async () => response) as unknown as typeof fetch
        // The suffix and the query are Next's, they change with the build, and
        // nothing here may care what they are — only that they are passed through.
        const advertised = 'https://peanutsplit.com/r/ski-trip-a_b-123/opengraph-image-a1b2c3?9a3e77b02c2f6d0d'

        await expect(prewarmRoomPreview('ski-trip-a_b-123', fetcher, docAdvertising(advertised))).resolves.toBe(true)
        expect(fetcher).toHaveBeenCalledWith(advertised, { cache: 'force-cache', credentials: 'same-origin' })
        expect(arrayBuffer).toHaveBeenCalledOnce()
    })

    it('sends no headers, so the warmed entry answers the crawler’s anonymous request', async () => {
        const fetcher = vi.fn(async () => png()) as unknown as typeof fetch
        await prewarmRoomPreview(
            'ski-trip-a_b-123',
            fetcher,
            docAdvertising('https://peanutsplit.com/r/ski-trip-a_b-123/opengraph-image-a1b2c3')
        )
        expect(vi.mocked(fetcher).mock.calls[0][1]).not.toHaveProperty('headers')
    })

    it('warms nothing from a page that is not the room', async () => {
        const fetcher = vi.fn(async () => png()) as unknown as typeof fetch
        // The landing hero and `/new` both create rooms while their own unfurl
        // card is the one in the head. Warming that would be the wrong image.
        const landing = {
            baseURI: 'https://peanutsplit.com/new',
            querySelector: () => ({ getAttribute: () => 'https://peanutsplit.com/opengraph-image-d4e5f6' }),
        }
        await expect(prewarmRoomPreview('ski-trip-a_b-123', fetcher, landing)).resolves.toBe(false)
        expect(fetcher).not.toHaveBeenCalled()
    })

    it('warms nothing when the head names another room', async () => {
        const fetcher = vi.fn(async () => png()) as unknown as typeof fetch
        const other = docAdvertising('https://peanutsplit.com/r/other-room-999/opengraph-image-a1b2c3')
        await expect(prewarmRoomPreview('ski-trip-a_b-123', fetcher, other)).resolves.toBe(false)
        expect(fetcher).not.toHaveBeenCalled()
    })

    it('leaves a cross-origin card to the crawler', async () => {
        const fetcher = vi.fn(async () => png()) as unknown as typeof fetch
        // `metadataBase` pins the tag to the canonical host, so the same room
        // served on the alternate domain advertises an off-origin image. Fetching
        // it would be a CORS error in the console — the noise this prewarm avoids.
        const alternateHost = docAdvertising(
            'https://split.peanut.me/r/ski-trip-a_b-123/opengraph-image-a1b2c3',
            'https://peanutsplit.com/r/ski-trip-a_b-123'
        )
        await expect(prewarmRoomPreview('ski-trip-a_b-123', fetcher, alternateHost)).resolves.toBe(false)
        expect(fetcher).not.toHaveBeenCalled()
    })

    it('warms nothing on the server, where there is no document', async () => {
        const fetcher = vi.fn(async () => png()) as unknown as typeof fetch
        await expect(prewarmRoomPreview('ski-trip-a_b-123', fetcher, undefined)).resolves.toBe(false)
        expect(fetcher).not.toHaveBeenCalled()
    })

    it('never rejects into the room experience when preview generation fails', async () => {
        const fetcher = vi.fn(async () => {
            throw new TypeError('offline')
        })
        const doc = docAdvertising('https://peanutsplit.com/r/offline-room/opengraph-image-a1b2c3')
        await expect(prewarmRoomPreview('offline-room', fetcher as typeof fetch, doc)).resolves.toBe(false)
    })
})

describe('room social-preview prewarm in the app', () => {
    const SLUG = 'ski-trip-kunc-syrup-drum'
    const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app')

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    async function loadNative() {
        vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
        vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://peanutsplit.com')
        vi.resetModules()
        return import('./room-preview')
    }

    it('derives the image path exactly as Next routes the room opengraph-image', () => {
        // If the route moves, the hash Next derives from its location moves with it.
        expect(existsSync(path.join(appDir, '(product-shell)', 'r', '[slug]', 'opengraph-image.tsx'))).toBe(true)
        expect(roomPreviewImagePath(SLUG)).toBe(
            fillMetadataSegment('/(product-shell)/r/[slug]', { slug: SLUG }, 'opengraph-image', false)
        )
    })

    it('fetches the room image on the site origin, opaquely, without a document to ask', async () => {
        const native = await loadNative()
        const calls: Array<[string, RequestInit | undefined]> = []
        const fetcher = (async (url: string, init?: RequestInit) => {
            calls.push([url, init])
            return new Response(null, { status: 200 })
        }) as unknown as typeof fetch

        await expect(native.prewarmRoomPreview(SLUG, fetcher, undefined)).resolves.toBe(true)
        expect(calls).toEqual([
            [`https://peanutsplit.com${roomPreviewImagePath(SLUG)}`, { mode: 'no-cors', cache: 'no-store' }],
        ])
        expect(calls[0][0]).toMatch(new RegExp(`^https://peanutsplit\\.com/r/${SLUG}/opengraph-image-[0-9a-z]{6}$`))
    })

    it('never rejects into the app when the warm fails', async () => {
        const native = await loadNative()
        const fetcher = (async () => {
            throw new TypeError('offline')
        }) as unknown as typeof fetch
        await expect(native.prewarmRoomPreview(SLUG, fetcher, undefined)).resolves.toBe(false)
    })
})
