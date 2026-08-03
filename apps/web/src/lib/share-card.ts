'use client'

/**
 * Handing a rendered card to the operating system, once, for every card in the app.
 *
 * The three-tier chain below is lifted verbatim out of `RecapShareButton` rather than rewritten,
 * because every rung of it was bought with a real browser bug. One behaviour, one implementation:
 * `RecapShareButton` now calls this too.
 */

import { useEffect, useState } from 'react'
import { copyImage } from '@/lib/clipboard'
import type { RecapShareTier } from '@/lib/recap'

/**
 * Fetch the PNG on mount and keep the `File`.
 *
 * Prefetching is what keeps the share tap synchronous: `navigator.share` needs transient user
 * activation, and an `await fetch` inside the gesture is the one thing that reliably loses it on
 * iOS. Every surface that uses this has the card on screen for seconds before anyone taps.
 *
 * `no-store` skips the browser's HTTP cache, which the route's own `max-age=300` would otherwise
 * let answer a share tap with a five-minute-old roster.
 *
 * It does NOT skip the service worker, and it is worth writing down rather than assuming:
 * `cache` is an HTTP-cache mode, while `sw.ts` spreads serwist's `defaultCache`, whose last
 * same-origin rule is a `NetworkFirst` bucket that matches every non-`/api/` path — card URLs
 * included — and its handler runs whatever `cache` says. Measured: with the page offline, a
 * `no-store` fetch of a card still resolved 200 out of Cache Storage. `NetworkFirst` means a
 * reachable network always wins, so the only time a share carries a stale card is offline — where
 * the alternative is a share with no card at all, and the cached one is the better answer. The
 * `<img>` shelf tiles keep that cache for the same reason: a shelf is a snapshot.
 *
 * A missing route answers 404 and this returns null. That is the designed degradation — the
 * calling surface shares text, or hides its button, and never shows a broken one.
 */
function useFetchedPng(path: string, filename: string, method: 'GET' | 'POST', body?: string): { file: File | null } {
    const [file, setFile] = useState<File | null>(null)

    useEffect(() => {
        let live = true
        setFile(null)
        void (async () => {
            try {
                const response = await fetch(path, {
                    method,
                    cache: 'no-store',
                    ...(body ? { headers: { 'Content-Type': 'application/json' }, body } : {}),
                })
                if (!response.ok) return
                const blob = await response.blob()
                if (!live) return
                setFile(new File([blob], filename, { type: blob.type || 'image/png' }))
            } catch {
                // Offline, or the route is not there yet. The caller degrades; nothing to say.
            }
        })()
        return () => {
            live = false
        }
    }, [path, filename, method, body])

    return { file }
}

export function useSharePng(path: string, filename: string): { file: File | null } {
    return useFetchedPng(path, filename, 'GET')
}

/**
 * The invite is personalized to the active room member, so it must never share
 * the cached GET representation used by the achievement shelf. The member id is
 * sent only in a POST body; the server verifies that it belongs to the room and
 * resolves the current name. No name, token or identifier enters the URL.
 */
export function useInviteSharePng(path: string, filename: string, sharerMemberId?: string): { file: File | null } {
    const body = JSON.stringify(sharerMemberId ? { memberId: sharerMemberId } : {})
    return useFetchedPng(path, filename, 'POST', body)
}

/**
 * native(files) → clipboard → download. Returns which rung fired, or null when they aborted.
 *
 * `canShare` must be probed with the EXACT object that will be passed to `share` — it inspects the
 * payload (file type, size, and which fields are present), so probing `{ files: [] }` or a
 * differently shaped object answers a question nobody asked. Some engines also refuse files
 * alongside `text`/`title`, hence the second, narrower probe rather than giving up on the sheet.
 *
 * Closing the share sheet is a decision, not a failure: an `AbortError` returns null and falls
 * through to nothing, because dropping a downloaded file on somebody who just declined is worse
 * than doing nothing.
 */
export async function shareImageFile(
    file: File,
    copy: { title: string; text: string }
): Promise<RecapShareTier | null> {
    const rich = { files: [file], title: copy.title, text: copy.text }
    const filesOnly = { files: [file] }
    const payload = navigator.canShare?.(rich) ? rich : navigator.canShare?.(filesOnly) ? filesOnly : null

    if (payload) {
        try {
            await navigator.share(payload)
            return 'files'
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return null
        }
    }

    if (await copyImage(file)) return 'clipboard'

    const objectUrl = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = file.name
    anchor.click()
    URL.revokeObjectURL(objectUrl)
    return 'download'
}
