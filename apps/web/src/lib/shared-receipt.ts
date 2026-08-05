/**
 * The one receipt photo the OS handed us, parked between the share sheet and the room that will
 * read it.
 *
 * ZERO IMPORTS, deliberately. This module is compiled into the service-worker bundle as well as
 * the app bundle, and `src/app/sw.ts` is excluded from tsconfig — a DOM-only import here would
 * fail at runtime, in a worker, on a phone, with no typecheck to catch it.
 *
 * Cache Storage rather than IndexedDB because the value already IS a Response body on the worker
 * side, so nothing is re-encoded on either end. One fixed key: there is only ever one share in
 * flight, and a second share replacing the first is what somebody who shared the wrong photo
 * expects.
 */

export const SHARE_TARGET_ACTION = '/api/share-target'
export const SHARE_TARGET_FIELD = 'receipt'
export const SHARE_TARGET_LANDING = '/share-target'
/** Applied in the worker before Cache Storage sees the full-resolution share.
 *  The page-side image pipeline enforces the same ceiling before decode. */
export const MAX_SHARED_RECEIPT_BYTES = 40 * 1024 * 1024
/** Maximum JPEG emitted by the 1600px client pipeline and accepted by the API.
 *  Kept here so the browser and server cannot drift to different ceilings. */
export const MAX_PREPARED_RECEIPT_BYTES = 4 * 1024 * 1024

const CACHE = 'ps:shared-receipt'
const KEY = '/__shared-receipt'

/**
 * How long a parked photo can wait for the room that will read it.
 *
 * A share somebody abandoned — backed out of the picker, closed the tab, landed on a join gate —
 * would otherwise remain locally parked indefinitely. Cache Storage cannot self-expire while the
 * PWA is closed, so every read and every app boot rejects an entry after this window.
 */
const SHARE_TTL_MS = 10 * 60 * 1000
const STAMP = 'x-parked-at'

const isFresh = (response: Response, now: number): boolean => {
    const parkedAt = Number(response.headers.get(STAMP) ?? 0)
    return Number.isFinite(parkedAt) && parkedAt > 0 && parkedAt <= now && now - parkedAt <= SHARE_TTL_MS
}

/** Worker side. Throws are the caller's to swallow: the SW turns any failure into the same
 *  "nothing arrived" screen the empty case produces. */
export async function storeSharedReceipt(storage: CacheStorage, file: File): Promise<void> {
    if (file.size === 0) throw new Error('shared receipt is empty')
    if (file.size > MAX_SHARED_RECEIPT_BYTES) throw new Error('shared receipt is too large to store')
    if (file.type && (!file.type.startsWith('image/') || file.type.startsWith('image/svg'))) {
        throw new Error('shared receipt is not a raster image')
    }

    const headers = new Headers({ [STAMP]: String(Date.now()) })
    // Passing any explicit headers to Response stops it inheriting Blob.type. Preserve the
    // Android content provider's real MIME so HEIC/PNG is decoded as itself, not as JPEG.
    if (file.type) headers.set('content-type', file.type)
    const cache = await storage.open(CACHE)
    await cache.put(KEY, new Response(file, { headers }))
}

/** Worker-side replacement boundary. Clear the prior share before even parsing the next one, so
 *  a malformed/no-file/oversized request can never route somebody to the previous receipt. */
export async function replaceSharedReceipt(storage: CacheStorage, readFile: () => Promise<File | null>): Promise<void> {
    // Unlike the UI-facing discard helper, this must reject if Cache Storage cannot be cleared.
    // The worker then stops without attempting to make an ambiguous replacement.
    await storage.delete(CACHE)
    const file = await readFile()
    if (!file) throw new Error('shared receipt is missing')
    await storeSharedReceipt(storage, file)
}

/** Page side, non-destructive: the picker asks whether there is anything to route. */
export async function hasSharedReceipt(storage: CacheStorage, now = Date.now()): Promise<boolean> {
    try {
        const response = await (await storage.open(CACHE)).match(KEY)
        if (!response) return false
        if (isFresh(response, now)) return true
        await storage.delete(CACHE)
        return false
    } catch {
        // Storage blocked (private mode, no origin quota). "Nothing shared" is the true answer.
        return false
    }
}

/** Room side, one-shot: a receipt handed to one room must not be handed to the next one too. */
export async function takeSharedReceipt(storage: CacheStorage, now = Date.now()): Promise<File | null> {
    try {
        const cache = await storage.open(CACHE)
        const response = await cache.match(KEY)
        if (!response) return null
        if (!isFresh(response, now)) {
            await storage.delete(CACHE)
            return null
        }
        await cache.delete(KEY)
        const blob = await response.blob()
        // A blank MIME is allowed because some Android content providers omit it; the image
        // decoder still checks the bytes. The name is never used as evidence of the file type.
        return new File([blob], 'receipt', { type: blob.type || 'image/jpeg' })
    } catch {
        return null
    }
}

/** Nothing that was never going to be scanned is left sitting in a cache. */
export async function discardSharedReceipt(storage: CacheStorage): Promise<void> {
    try {
        await storage.delete(CACHE)
    } catch {
        // Same reasoning as above: there is nobody to tell and nothing to do.
    }
}

/**
 * Called on every app boot. The discard paths cover every exit somebody actually takes; this
 * covers the ones nobody takes — a tab closed between the redirect and the drawer, a room whose
 * state never loaded. Anything older than the TTL was never going to be scanned.
 */
export async function sweepSharedReceipt(storage: CacheStorage, now = Date.now()): Promise<void> {
    try {
        const response = await (await storage.open(CACHE)).match(KEY)
        if (!response) return
        if (!isFresh(response, now)) await storage.delete(CACHE)
    } catch {
        // Storage blocked. Nothing is parked and nothing is leaking.
    }
}
