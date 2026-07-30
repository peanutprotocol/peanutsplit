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
 * `no-store` for two reasons that stack. The route sets `max-age=300`, and — less obviously —
 * `sw.ts` spreads serwist's `defaultCache`, whose last same-origin rule is a `NetworkFirst`
 * bucket matching every non-`/api/` path, card URLs included, for 24 hours. Without this a crew
 * card fetched at three members could be handed to the share sheet a day after the room reached
 * five. The `<img>` shelf tiles keep that cache on purpose: a shelf is a snapshot.
 *
 * A missing route answers 404 and this returns null. That is the designed degradation — the
 * calling surface shares text, or hides its button, and never shows a broken one.
 */
export function useSharePng(path: string, filename: string): { file: File | null } {
    const [file, setFile] = useState<File | null>(null)

    useEffect(() => {
        let live = true
        setFile(null)
        void (async () => {
            try {
                const response = await fetch(path, { cache: 'no-store' })
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
    }, [path, filename])

    return { file }
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
