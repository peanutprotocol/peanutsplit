'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { roomProps, track } from '../analytics'
import { awaitColdPushTap } from './cold-push-tap'
import { loadHost } from './host'
import { nativePathForUrl, roomSlugOfNativePath, type NativeNav } from './links'
import { decideEntry } from './native-entry'

declare global {
    interface Window {
        /** Set by the boot-path script in layout.native.tsx before hydration. */
        __splitBootPath?: string
    }
}

/**
 * The app's root screen: decides where a cold start or a hard load goes (ARCHITECTURE 4.3). The
 * order lives in `decideEntry`. It renders nothing; the native splash covers it until the next
 * screen commits.
 */
export function NativeEntry(): null {
    const router = useRouter()
    const started = useRef(false)

    useEffect(() => {
        if (started.current) return
        started.current = true

        const bootPath = window.__splitBootPath
        // Consumed once: a later visit to `/` must not restore the old location again.
        window.__splitBootPath = '/'

        const nav: NativeNav = {
            currentPath: () => window.location.pathname,
            replace: (path) => router.replace(path),
            push: (path) => router.push(path),
            openExternal: (url) => void loadHost()?.then((host) => host.browser.open(url)),
        }

        void decideEntry({
            bootPath,
            nav,
            getLaunchUrl: async () => (await loadHost())?.app.getLaunchUrl() ?? null,
            awaitColdPushTap,
        }).then((decision) => {
            if (decision.step === 'launch' && decision.result === 'navigated') {
                const target = nativePathForUrl(decision.url)
                const slug = target && 'path' in target ? roomSlugOfNativePath(target.path) : null
                if (slug) track('app_room_opened', roomProps(slug, { via: 'launch' }))
            }
            // Task 3A: a cold push tap (decision.step === 'push') sends its opened beacon and
            // app_room_opened { via: 'push' } here.
        })
    }, [router])

    return null
}
