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

const CACHE = 'ps:shared-receipt'
const KEY = '/__shared-receipt'

/**
 * How long a parked photo can wait for the room that will read it.
 *
 * The app tells people in three languages that a scanned photo "is read once and never stored".
 * A share somebody abandoned — backed out of the picker, closed the tab, landed on a join gate —
 * would otherwise sit here at full resolution for ever, which would make that sentence false.
 */
const SHARE_TTL_MS = 10 * 60 * 1000
const STAMP = 'x-parked-at'

/** Worker side. Throws are the caller's to swallow: the SW turns any failure into the same
 *  "nothing arrived" screen the empty case produces. */
export async function storeSharedReceipt(storage: CacheStorage, file: File): Promise<void> {
    if (file.size > MAX_SHARED_RECEIPT_BYTES) throw new Error('shared receipt is too large to store')
    const cache = await storage.open(CACHE)
    await cache.put(KEY, new Response(file, { headers: { [STAMP]: String(Date.now()) } }))
}

/** Page side, non-destructive: the picker asks whether there is anything to route. */
export async function hasSharedReceipt(storage: CacheStorage): Promise<boolean> {
    try {
        return (await (await storage.open(CACHE)).match(KEY)) !== undefined
    } catch {
        // Storage blocked (private mode, no origin quota). "Nothing shared" is the true answer.
        return false
    }
}

/** Room side, one-shot: a receipt handed to one room must not be handed to the next one too. */
export async function takeSharedReceipt(storage: CacheStorage): Promise<File | null> {
    try {
        const cache = await storage.open(CACHE)
        const response = await cache.match(KEY)
        if (!response) return null
        await cache.delete(KEY)
        const blob = await response.blob()
        // Explicit headers mean the Response no longer inherits the blob's own Content-Type, so
        // the fallback below is load-bearing. The name is never read — ScanFlow keys on object
        // identity and scan-image.ts on bytes.
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
        const parkedAt = Number(response.headers.get(STAMP) ?? 0)
        if (!Number.isFinite(parkedAt) || now - parkedAt > SHARE_TTL_MS) await storage.delete(CACHE)
    } catch {
        // Storage blocked. Nothing is parked and nothing is leaking.
    }
}
