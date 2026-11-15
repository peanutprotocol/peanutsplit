'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { focusManager } from '@tanstack/react-query'
import { roomProps, track } from '../analytics'
import { NATIVE_PUSH_ENABLED } from '../platform'
import { openWarmTap } from './cold-push-tap'
import { loadHost } from './host'
import { dispatchNativeLink, nativePathForUrl, roomSlugOfNativePath, type NativeNav } from './links'
import { backAction } from './native-entry'
import { checkVersionNow } from './version-gate'

/**
 * Runtime listeners for the whole app (ARCHITECTURE 4.5), mounted once in NativeShell:
 * links that open the running app, notification taps, the return to the foreground, and Android back.
 */
export function NativeLinks(): null {
    const router = useRouter()

    useEffect(() => {
        const host = loadHost()
        if (!host) return

        let disposed = false
        let disposers: Array<() => void> = []

        const nav: NativeNav = {
            currentPath: () => window.location.pathname,
            replace: (path) => router.replace(path),
            push: (path) => router.push(path),
            openExternal: (url) => void host.then((cap) => cap.browser.open(url)),
        }

        void host.then(async (cap) => {
            const attached = await Promise.all([
                // A warm link, a Smart App Banner "Open", or the retained launch link on a cold start
                // (the same dispatcher as NativeEntry, so that one counts once).
                cap.app.onUrlOpen((url) => {
                    if (dispatchNativeLink(url, 'open', nav) !== 'navigated') return
                    const target = nativePathForUrl(url)
                    const slug = target && 'path' in target ? roomSlugOfNativePath(target.path) : null
                    if (slug) track('app_room_opened', roomProps(slug, { via: 'link' }))
                }),
                // React Query never sees a WebView visibility change it can trust, so the app
                // lifecycle drives focus. Pause first, so every resume is a change that refetches.
                cap.app.onPause(() => focusManager.setFocused(false)),
                cap.app.onResume(() => {
                    focusManager.setFocused(true)
                    // The offline expense queue drains on `online`; the OS may have restored the
                    // network while the app slept without the WebView firing it.
                    window.dispatchEvent(new Event('online'))
                    checkVersionNow()
                }),
                // Attaching this listener replaces Capacitor's default, which would walk back from
                // the rooms home into the last room instead of leaving the app.
                cap.app.onBackButton((canGoBack) => {
                    const action = backAction(window.location.pathname, canGoBack)
                    if (action === 'minimize') void cap.app.minimize()
                    else if (action === 'history-back') window.history.back()
                    else router.replace(action.replace)
                }),
                // A notification tapped while the app runs. The tap that launched the app is
                // NativeEntry's (cold-push-tap.ts); openWarmTap skips it. Push compiled out: nothing.
                NATIVE_PUSH_ENABLED
                    ? cap.push.onTap((data) => void openWarmTap(data, (path) => router.push(path)))
                    : Promise.resolve(() => {}),
            ])
            if (disposed) attached.forEach((dispose) => dispose())
            else disposers = attached
        })

        return () => {
            disposed = true
            disposers.forEach((dispose) => dispose())
        }
    }, [router])

    return null
}
