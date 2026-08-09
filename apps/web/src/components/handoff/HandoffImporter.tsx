'use client'

import { useEffect } from 'react'
import { CANONICAL_APP_HOST, CANONICAL_APP_ORIGIN, isLoopbackHost, LEGACY_APP_ORIGIN } from '@/lib/domains'
import {
    HANDOFF_DONE_KEY,
    handoffNeedsReload,
    handoffRequest,
    importHandoffKeys,
    parseHandoffReply,
} from '@/lib/handoff'

/** How long the legacy origin gets to answer before this device is declared fresh. */
const HANDOFF_TIMEOUT_MS = 4_000
/** The iframe's load event can race the listener registration inside it; re-ask on a beat. */
const HANDOFF_ASK_INTERVAL_MS = 500

/**
 * The canonical-origin half of the localStorage handoff (see `lib/handoff.ts`).
 *
 * Mounted app-wide from `Providers`, renders nothing, and runs at most once per device:
 * a hidden iframe of the OLD origin's `/handoff` page, one request, one reply, one
 * write-if-absent import — then the `ps:handoff-done` guard goes down and the iframe
 * never exists again. The guard is set on timeout too: a device that had nothing to
 * fetch (or could not reach the legacy origin) should not retry on every visit forever.
 *
 * Origin discipline, both directions: the request is posted with the legacy origin as
 * `targetOrigin`, and a reply counts only when `event.origin` is exactly the legacy
 * origin AND `event.source` is our own iframe. Everything else is inert by
 * construction: on the legacy host and on dev/e2e (where the two origins are equal or
 * the hostname matches neither) the effect returns before touching the DOM.
 */
export function HandoffImporter() {
    useEffect(() => {
        if (CANONICAL_APP_ORIGIN === LEGACY_APP_ORIGIN) return
        // Dev and e2e derive a loopback canonical host, which the page's own hostname
        // would match — without this line every local session would iframe production.
        if (isLoopbackHost(CANONICAL_APP_HOST)) return
        if (window.location.hostname.toLowerCase() !== CANONICAL_APP_HOST) return

        let storage: Storage
        try {
            storage = window.localStorage
            if (storage.getItem(HANDOFF_DONE_KEY) !== null) return
        } catch {
            return
        }

        let settled = false
        const iframe = document.createElement('iframe')
        iframe.style.display = 'none'
        iframe.setAttribute('aria-hidden', 'true')
        iframe.src = `${LEGACY_APP_ORIGIN}/handoff`

        const ask = () => {
            try {
                iframe.contentWindow?.postMessage(handoffRequest(), LEGACY_APP_ORIGIN)
            } catch {
                // The frame may not be ready yet; the interval asks again.
            }
        }

        const teardown = () => {
            window.removeEventListener('message', onMessage)
            clearInterval(asker)
            clearTimeout(deadline)
            iframe.remove()
        }

        const finish = (imported: string[]) => {
            if (settled) return
            settled = true
            try {
                storage.setItem(HANDOFF_DONE_KEY, String(Date.now()))
            } catch {
                // If the guard cannot be written the import cannot have written either;
                // trying again next visit is the right outcome.
            }
            teardown()
            // The landing page read `ps:recent` before the import landed. One reload,
            // provably once — the guard above is already down, so the reloaded page
            // returns at the top of this effect.
            if (handoffNeedsReload(imported)) window.location.reload()
        }

        const onMessage = (event: MessageEvent) => {
            if (event.origin !== LEGACY_APP_ORIGIN) return
            if (event.source !== iframe.contentWindow) return
            const keys = parseHandoffReply(event.data)
            if (!keys) return
            finish(importHandoffKeys(keys, storage))
        }

        window.addEventListener('message', onMessage)
        iframe.addEventListener('load', ask)
        const asker = setInterval(ask, HANDOFF_ASK_INTERVAL_MS)
        const deadline = setTimeout(() => finish([]), HANDOFF_TIMEOUT_MS)
        document.body.appendChild(iframe)

        return () => {
            // Unmount before the reply (dev strict-mode remount, a hard navigation):
            // drop the machinery WITHOUT setting the guard, so the next mount retries.
            if (!settled) {
                settled = true
                teardown()
            }
        }
    }, [])

    return null
}
