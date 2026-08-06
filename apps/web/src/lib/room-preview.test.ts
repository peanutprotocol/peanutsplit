import { describe, expect, it, vi } from 'vitest'
import { prewarmRoomPreview, roomPreviewImagePath } from './room-preview'

describe('room social-preview prewarm', () => {
    it('fetches the exact same-origin room image into cache and consumes it', async () => {
        const response = new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
        })
        const arrayBuffer = vi.spyOn(response, 'arrayBuffer')
        const fetcher = vi.fn(async () => response) as unknown as typeof fetch

        await expect(prewarmRoomPreview('ski-trip-a_b-123', fetcher)).resolves.toBe(true)
        expect(roomPreviewImagePath('ski-trip-a_b-123')).toBe('/r/ski-trip-a_b-123/opengraph-image')
        expect(fetcher).toHaveBeenCalledWith('/r/ski-trip-a_b-123/opengraph-image', {
            cache: 'force-cache',
            credentials: 'same-origin',
        })
        expect(arrayBuffer).toHaveBeenCalledOnce()
    })

    it('contains odd input in one encoded path segment', () => {
        expect(roomPreviewImagePath('room/../other?token=2')).toBe('/r/room%2F..%2Fother%3Ftoken%3D2/opengraph-image')
    })

    it('never rejects into the room experience when preview generation fails', async () => {
        const fetcher = vi.fn(async () => {
            throw new TypeError('offline')
        })
        await expect(prewarmRoomPreview('offline-room', fetcher as typeof fetch)).resolves.toBe(false)
    })
})
