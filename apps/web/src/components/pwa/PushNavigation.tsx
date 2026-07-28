'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Turns a tapped notification into a client-side route change.
 *
 * The service worker cannot navigate a window itself — `client.navigate()` is
 * non-standard and gone from Chrome since M99 — so it focuses the window and
 * posts the destination instead. This listener is the other end of that.
 */
export function PushNavigation() {
    const router = useRouter()

    useEffect(() => {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

        const onMessage = (event: MessageEvent) => {
            const data = event.data as { type?: string; url?: string } | null
            if (data?.type !== 'navigate' || typeof data.url !== 'string') return
            // Same-origin paths only. A message is not a trust boundary we can
            // see through, and an absolute URL here would be an open redirect
            // driven by whatever reached the worker.
            if (!data.url.startsWith('/') || data.url.startsWith('//')) return
            router.push(data.url)
        }

        navigator.serviceWorker.addEventListener('message', onMessage)
        return () => navigator.serviceWorker.removeEventListener('message', onMessage)
    }, [router])

    return null
}
