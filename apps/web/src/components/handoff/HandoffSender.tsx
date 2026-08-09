'use client'

import { useEffect } from 'react'
import { CANONICAL_APP_ORIGIN } from '@/lib/domains'
import { collectHandoffKeys, handoffReply, isHandoffRequest } from '@/lib/handoff'

/**
 * The legacy-origin half of the localStorage handoff (see `lib/handoff.ts`).
 *
 * Sits on `/handoff` waiting to be iframed by the canonical origin. It answers exactly
 * one message shape from exactly one origin: `event.origin` must be the canonical
 * origin, compared whole — there is no CSP in this app, so this comparison is the only
 * thing standing between a stranger's iframe and every room credential on the device.
 * The reply goes back to `event.source` with the SAME origin as its target, never `'*'`.
 */
export function HandoffSender() {
    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== CANONICAL_APP_ORIGIN) return
            if (!isHandoffRequest(event.data)) return

            let keys: Record<string, string>
            try {
                keys = collectHandoffKeys(window.localStorage)
            } catch {
                // Privacy mode: nothing readable means nothing to hand over. Stay silent
                // and let the asking side hit its timeout.
                return
            }
            ;(event.source as WindowProxy | null)?.postMessage(handoffReply(keys), event.origin)
        }

        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
    }, [])

    return null
}
