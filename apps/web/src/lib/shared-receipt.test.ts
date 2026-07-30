import { describe, expect, it } from 'vitest'
import {
    discardSharedReceipt,
    hasSharedReceipt,
    storeSharedReceipt,
    sweepSharedReceipt,
    takeSharedReceipt,
} from './shared-receipt'

/**
 * `vitest.config.ts` runs `environment: 'node'`, so there is no `caches` here — which is exactly
 * why every function in the module takes its `CacheStorage` as an argument. The stub below is a
 * real gate rather than theatre: it is the same shape the worker and the page pass in. Node's
 * `File`, `Blob` and `Response` globals do the rest.
 */
function fakeCacheStorage() {
    const caches = new Map<string, Map<string, Response>>()
    return {
        caches,
        storage: {
            open: (name: string) => {
                const entries = caches.get(name) ?? new Map<string, Response>()
                caches.set(name, entries)
                return Promise.resolve({
                    put: (key: string, response: Response) => {
                        entries.set(key, response)
                        return Promise.resolve()
                    },
                    match: (key: string) => Promise.resolve(entries.get(key)),
                    delete: (key: string) => Promise.resolve(entries.delete(key)),
                })
            },
            delete: (name: string) => Promise.resolve(caches.delete(name)),
        } as unknown as CacheStorage,
    }
}

const receipt = (bytes: string, type = 'image/jpeg') => new File([bytes], 'bill.jpg', { type })

describe('a shared receipt', () => {
    it('survives the round trip with its bytes and its mime, and only once', async () => {
        const { storage } = fakeCacheStorage()
        await storeSharedReceipt(storage, receipt('the bill'))

        expect(await hasSharedReceipt(storage)).toBe(true)

        const taken = await takeSharedReceipt(storage)
        expect(taken).toBeInstanceOf(File)
        expect(await taken?.text()).toBe('the bill')
        expect(taken?.type).toBe('image/jpeg')

        // One-shot: a receipt handed to one room must not be handed to the next one too.
        expect(await takeSharedReceipt(storage)).toBeNull()
        expect(await hasSharedReceipt(storage)).toBe(false)
    })

    it('is replaced by the next share, because that is what sharing again means', async () => {
        const { storage } = fakeCacheStorage()
        await storeSharedReceipt(storage, receipt('first'))
        await storeSharedReceipt(storage, receipt('second'))

        expect(await (await takeSharedReceipt(storage))?.text()).toBe('second')
    })

    it('is discarded whole', async () => {
        const { storage } = fakeCacheStorage()
        await storeSharedReceipt(storage, receipt('the bill'))

        await discardSharedReceipt(storage)

        expect(await hasSharedReceipt(storage)).toBe(false)
    })

    it('answers "nothing shared" rather than throwing when storage is blocked', async () => {
        const blocked = {
            open: () => Promise.reject(new Error('quota')),
            delete: () => Promise.reject(new Error('quota')),
        } as unknown as CacheStorage

        expect(await hasSharedReceipt(blocked)).toBe(false)
        expect(await takeSharedReceipt(blocked)).toBeNull()
        await expect(discardSharedReceipt(blocked)).resolves.toBeUndefined()
        await expect(sweepSharedReceipt(blocked)).resolves.toBeUndefined()
    })
})

describe('the boot sweep', () => {
    const MINUTE = 60 * 1000

    it('leaves a share that is still on its way to a room', async () => {
        const { storage } = fakeCacheStorage()
        await storeSharedReceipt(storage, receipt('the bill'))

        await sweepSharedReceipt(storage, Date.now() + 9 * MINUTE)

        expect(await hasSharedReceipt(storage)).toBe(true)
    })

    it('drops a share nobody came back for', async () => {
        const { storage } = fakeCacheStorage()
        await storeSharedReceipt(storage, receipt('the bill'))

        await sweepSharedReceipt(storage, Date.now() + 11 * MINUTE)

        expect(await hasSharedReceipt(storage)).toBe(false)
    })

    it('drops an entry with no stamp at all, rather than keeping it for ever', async () => {
        const { storage, caches } = fakeCacheStorage()
        caches.set('ps:shared-receipt', new Map([['/__shared-receipt', new Response('the bill')]]))

        await sweepSharedReceipt(storage)

        expect(await hasSharedReceipt(storage)).toBe(false)
    })

    it('does nothing when nothing is parked', async () => {
        const { storage, caches } = fakeCacheStorage()

        await sweepSharedReceipt(storage)

        expect(caches.get('ps:shared-receipt')?.size ?? 0).toBe(0)
    })
})
