import { loadHost } from './host'

/** Base64 without a data-URL prefix, as the Filesystem plugin expects. Chunked to stay under the argument limit. */
async function toBase64(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let start = 0; start < bytes.length; start += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
    }
    return btoa(binary)
}

/** A cache file name the OS accepts: the last path segment of the File's name, never empty. */
export function cacheFileName(file: File, index: number): string {
    const base = (file.name || '').split(/[\\/]/).pop()?.trim() ?? ''
    return base && base !== '.' && base !== '..' ? base : `share-${index + 1}`
}

/** Web Share's rule: a payload must carry at least one of title, text, url or a non-empty file list. */
export function isSharePayload(data: ShareData | undefined): boolean {
    if (!data) return false
    if (data.files !== undefined && (!Array.isArray(data.files) || data.files.some((file) => !(file instanceof Blob))))
        return false
    return Boolean(data.title || data.text || data.url || data.files?.length)
}

async function nativeShare(data?: ShareData): Promise<void> {
    if (!data || !isSharePayload(data)) throw new TypeError('Nothing to share')
    const host = loadHost()
    if (!host) throw new DOMException('Sharing is not available', 'NotAllowedError')
    const { share, filesystem } = await host

    let files: string[] | undefined
    if (data.files?.length) {
        files = []
        for (const [index, file] of data.files.entries()) {
            // The share sheet takes file URIs, not blobs: write each file to the app cache first.
            const uri = await filesystem.writeCacheFile(cacheFileName(file, index), await toBase64(file))
            if (!uri) throw new DOMException('Could not prepare the file to share', 'DataError')
            files.push(uri)
        }
    }

    const shared = await share.share({ title: data.title, text: data.text, url: data.url, files })
    // The wrapper cannot tell a dismissed sheet from a failed one. Callers treat AbortError as the
    // person's own decision and stay quiet, which is the right reading for nearly every `false`.
    if (!shared) throw new DOMException('Share canceled', 'AbortError')
}

/**
 * Serves `navigator.share` (including files) through the native share sheet (ARCHITECTURE 9.2).
 *
 * Android's WebView has no `navigator.share`, so without this every Share button silently becomes
 * Copy there. Installed only where `share` is missing (iOS's WKWebView has its own); `canShare` is
 * replaced together with it so the two always describe the same implementation. Defining a missing
 * property on `navigator` is not a prototype patch.
 */
export function installSharePolyfill(): void {
    if (typeof navigator === 'undefined' || typeof navigator.share === 'function') return
    Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: nativeShare })
    Object.defineProperty(navigator, 'canShare', { configurable: true, writable: true, value: isSharePayload })
}
