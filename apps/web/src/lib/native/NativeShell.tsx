'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Providers } from '@/lib/providers'
import { runCorsSelfTest } from './cors-selftest'
import { installExternalLinks } from './external-links'
import { loadHost } from './host'
import { NativeIntlProvider } from './NativeIntlProvider'
import { NativeLinks } from './NativeLinks'
import { installSharePolyfill } from './polyfills'
import { hydrateStorageMirror, installStorageMirror } from './storage-mirror'
import { VersionGate } from './VersionGate'

/** A broken Preferences plugin must never hold the app at a blank screen. */
const HYDRATE_CAP_MS = 1_500
/** A routing bug must never leave the splash up for good (peanut-ui pitfall 11). */
const SPLASH_CAP_MS = 4_000

let splashHidden = false

function hideSplash(): void {
    if (splashHidden) return
    splashHidden = true
    void loadHost()?.then((host) => host.splash.hide())
}

/**
 * The app's client root, inside layout.native.tsx. Order (PLAN.md 4.1): restore evicted room keys,
 * install the native shims, then render the product providers. The status bar needs nothing here:
 * capacitor.config.ts sets it before the WebView loads.
 */
export function NativeShell({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const [ready, setReady] = useState(false)

    useEffect(() => {
        let disposed = false
        let disposeExternalLinks = () => {}
        const cap = new Promise<void>((resolve) => setTimeout(resolve, HYDRATE_CAP_MS))
        void Promise.race([hydrateStorageMirror().catch(() => {}), cap]).then(() => {
            if (disposed) return
            // Installed before any screen mounts, so the first write of a room key is mirrored too.
            installStorageMirror()
            installSharePolyfill()
            disposeExternalLinks = installExternalLinks((path) => router.push(path))
            // A literal property access, so Next inlines it; release builds never set it.
            if (process.env.NEXT_PUBLIC_SPLIT_CORS_SELFTEST === '1') runCorsSelfTest()
            setReady(true)
        })
        return () => {
            disposed = true
            disposeExternalLinks()
        }
    }, [router])

    useEffect(() => {
        const timer = setTimeout(hideSplash, SPLASH_CAP_MS)
        return () => clearTimeout(timer)
    }, [])

    useEffect(() => {
        // `/` is NativeEntry, which renders nothing; the first other path is the first real screen.
        if (ready && pathname !== '/') hideSplash()
    }, [ready, pathname])

    if (!ready) return null
    return (
        <NativeIntlProvider>
            <Providers>
                <VersionGate>{children}</VersionGate>
                <NativeLinks />
            </Providers>
        </NativeIntlProvider>
    )
}
