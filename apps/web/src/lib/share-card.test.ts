import { afterEach, describe, expect, it, vi } from 'vitest'
import { shareImageFile } from './share-card'

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('public card sharing', () => {
    it('hands the native sheet one image and no room-link-capable fields', async () => {
        const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'crew.png', {
            type: 'image/png',
        })
        const canShare = vi.fn(() => true)
        const share = vi.fn(async (_payload: ShareData) => undefined)
        vi.stubGlobal('navigator', { canShare, share })

        await expect(shareImageFile(file)).resolves.toBe('files')

        const expected = { files: [file] }
        expect(canShare).toHaveBeenCalledWith(expected)
        expect(share).toHaveBeenCalledWith(expected)
        const payload = share.mock.calls[0]?.[0]
        expect(payload).toBeDefined()
        if (!payload) throw new Error('share payload missing')
        expect(Object.keys(payload)).toEqual(['files'])
        expect(payload).not.toHaveProperty('url')
        expect(payload).not.toHaveProperty('text')
        expect(payload).not.toHaveProperty('title')
    })
})
