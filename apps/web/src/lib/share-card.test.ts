import { afterEach, describe, expect, it, vi } from 'vitest'
import { shareImageFile } from './share-card'

afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.resetModules()
})

const card = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'crew.png', { type: 'image/png' })

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

describe('the download floor', () => {
    it('on web, saves the card through a download link when share and clipboard are missing', async () => {
        vi.stubGlobal('navigator', {})
        const clicked: string[] = []
        const anchor = { href: '', download: '', click: () => clicked.push(anchor.download), remove: () => {} }
        vi.stubGlobal('document', { createElement: () => anchor, body: { append: () => {} } })
        vi.stubGlobal('window', { setTimeout: () => 0 })
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:split/card')

        await expect(shareImageFile(card())).resolves.toBe('download')
        expect(clicked).toEqual(['crew.png'])
    })

    it('in the app, a closed share sheet on the floor is no share at all', async () => {
        vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
        vi.resetModules()
        const native = await import('./share-card')
        // canShare says no (the files rung is skipped); the floor's share sheet is then closed.
        vi.stubGlobal('navigator', {
            canShare: () => false,
            share: async () => {
                throw new DOMException('closed', 'AbortError')
            },
        })

        await expect(native.shareImageFile(card())).resolves.toBeNull()
    })

    it('in the app, the floor hands the card to the share sheet as a file', async () => {
        vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
        vi.resetModules()
        const native = await import('./share-card')
        const shared: File[] = []
        vi.stubGlobal('navigator', {
            canShare: () => false,
            share: async (data: ShareData) => void shared.push(...(data.files ?? [])),
        })

        await expect(native.shareImageFile(card())).resolves.toBe('download')
        expect(shared.map((file) => [file.name, file.type])).toEqual([['crew.png', 'image/png']])
    })
})
