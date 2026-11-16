import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveFile } from './save-file'

/** A stand-in for the bits of `document` and `window` the web download touches, recording what happened. */
function webPage() {
    const events: string[] = []
    const anchor = {
        href: '',
        download: '',
        click: () => events.push(`click ${anchor.href} as ${anchor.download}`),
        remove: () => events.push('removed'),
    }
    vi.stubGlobal('document', {
        createElement: (tag: string) => (tag === 'a' ? anchor : null),
        body: { append: () => events.push('appended') },
    })
    const timers: Array<() => void> = []
    vi.stubGlobal('window', { setTimeout: (run: () => void) => timers.push(run) })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:split/1')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((href) => events.push(`revoked ${href}`))
    return { events, runTimers: () => timers.splice(0).forEach((run) => run()) }
}

async function loadNative() {
    vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', '1')
    vi.resetModules()
    return (await import('./save-file')).saveFile
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.resetModules()
})

describe('saveFile on web', () => {
    it('clicks a download link and frees the object URL only after the click', async () => {
        const page = webPage()

        await expect(saveFile(new Blob(['a,b'], { type: 'text/csv' }), 'ski-trip.csv')).resolves.toBe(true)
        expect(page.events).toEqual(['appended', 'click blob:split/1 as ski-trip.csv', 'removed'])

        page.runTimers()
        expect(page.events.at(-1)).toBe('revoked blob:split/1')
    })
})

describe('saveFile in the app', () => {
    it('hands the share sheet one file with the given name, type and bytes', async () => {
        const save = await loadNative()
        const shared: ShareData[] = []
        vi.stubGlobal('navigator', { share: async (data: ShareData) => void shared.push(data) })

        await expect(save(new Blob(['{"a":1}'], { type: 'application/json' }), 'room-history.json')).resolves.toBe(true)

        expect(shared).toHaveLength(1)
        expect(Object.keys(shared[0])).toEqual(['files'])
        const [file] = shared[0].files ?? []
        expect(file.name).toBe('room-history.json')
        expect(file.type).toBe('application/json')
        expect(await file.text()).toBe('{"a":1}')
    })

    it('treats a closed share sheet as a decision, not a failure', async () => {
        const save = await loadNative()
        vi.stubGlobal('navigator', {
            share: async () => {
                throw new DOMException('closed', 'AbortError')
            },
        })

        await expect(save(new Blob(['x']), 'room.csv')).resolves.toBe(false)
    })

    it('rejects when the share itself fails, so the caller can say so', async () => {
        const save = await loadNative()
        vi.stubGlobal('navigator', {
            share: async () => {
                throw new Error('cache write failed')
            },
        })

        await expect(save(new Blob(['x']), 'room.csv')).rejects.toThrow('cache write failed')
    })
})
