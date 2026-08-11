'use client'

import { useEffect } from 'react'

/**
 * Register the generated worker only after the canonical product document hydrates.
 *
 * `@serwist/next` still creates `window.serwist` in its client entry, but its global automatic
 * registration is disabled in next.config.js because that entry is shared with the content root.
 * The native branch is a defensive ordering fallback: Serwist's entry normally runs first, but a
 * delayed client chunk must not make an otherwise valid product install silently disappear.
 */
export function RegisterProductServiceWorker() {
    useEffect(() => {
        if (
            process.env.NODE_ENV !== 'production' ||
            !('serviceWorker' in navigator) ||
            typeof window.caches === 'undefined'
        ) {
            return
        }

        const registration =
            window.serwist !== undefined
                ? window.serwist.register()
                : navigator.serviceWorker.register('/sw.js', { scope: '/' })
        const reloadOnOnline = () => window.location.reload()
        window.addEventListener('online', reloadOnOnline)

        // Installation is an enhancement. A browser policy or storage failure must not surface as
        // an unhandled rejection or interrupt the room UI.
        void registration.catch(() => undefined)

        return () => window.removeEventListener('online', reloadOnOnline)
    }, [])

    return null
}
