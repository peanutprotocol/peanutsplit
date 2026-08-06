/**
 * The social image attached by chat apps after they inspect a room URL.
 *
 * This deliberately uses the room's existing capability URL. There is no
 * second token and no external image service: the same origin renders and
 * caches the preview for the intentional invite link.
 */
export const roomPreviewImagePath = (slug: string): string => `/r/${encodeURIComponent(slug)}/opengraph-image`

/**
 * Start rendering the room preview before somebody reaches for Share.
 *
 * Consuming the response lets the browser HTTP cache, the service worker and
 * any shared HTTP cache in front of the app retain the completed PNG. Failure
 * is intentionally a boolean: preview art is an enhancement to the URL and can
 * never make room creation, room access or sharing fail.
 */
export async function prewarmRoomPreview(slug: string, fetcher: typeof fetch = globalThis.fetch): Promise<boolean> {
    if (!slug || typeof fetcher !== 'function') return false

    try {
        const response = await fetcher(roomPreviewImagePath(slug), {
            cache: 'force-cache',
            credentials: 'same-origin',
        })
        if (!response.ok) return false
        await response.arrayBuffer()
        return response.headers.get('content-type')?.startsWith('image/') ?? true
    } catch {
        return false
    }
}
