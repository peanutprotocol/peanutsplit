'use client'

import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { useLocale } from 'next-intl'
import { usePathname } from 'next/navigation'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Toaster } from 'sonner'
import { PushNavigation } from '@/components/pwa/PushNavigation'
import { asLocale } from '@/i18n/locales'
import { localeFromPathname } from '@/i18n/paths'
import { initAnalytics } from './analytics'
import { ensureDeviceId } from './identity'
import { captureInstallPrompt } from './install'
import { sweepSharedReceipt } from './shared-receipt'
import { writeLocaleCookie } from './locale-cookie'
import { useOfflineQueueRunner } from './queries'
import { TOAST_MS } from './toasts'
import { useAnimationPreferenceClass, useMotionAllowed } from './use-motion'

/**
 * The home-screen dot, cleared.
 *
 * The service worker sets it when a push is shown for a device that was away. Only one thing can
 * honestly clear it: the app being looked at. A dot cannot name a room, so opening the app at all
 * is the clear — including the case where the news was in a different room than the one you
 * opened. That imprecision is exactly why this is a dot and not a count.
 *
 * Absent everywhere but an installed app on a browser that ships the Badging API, where the call
 * is a no-op. Nothing here is worth a capability check at the call site.
 */
function clearAppBadge(): void {
    if (typeof navigator === 'undefined') return
    void (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => {})
}

/** The offline queue's engine, mounted once. A component only because it needs
 *  to be inside the QueryClientProvider — it renders nothing. */
function OfflineQueueRunner() {
    useOfflineQueueRunner()
    return null
}

/**
 * The single client boundary at the root: React Query, nuqs' URL adapter, and
 * the toast host. Also mints the device id on first paint, so the claim flow
 * that ships after v1 finds a cookie already in place.
 */
export function Providers({ children }: { children: React.ReactNode }) {
    const locale = useLocale()
    const pathname = usePathname()
    const motionAllowed = useMotionAllowed()
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // Room state is polled; a short stale window keeps drawer
                        // opens instant without serving genuinely old money.
                        staleTime: 2_000,
                        retry: 1,
                        refetchOnWindowFocus: true,
                    },
                    mutations: { retry: 0 },
                },
            })
    )

    useEffect(() => {
        ensureDeviceId()
        initAnalytics()
        // `beforeinstallprompt` fires once per page load and is gone if nobody is listening — long
        // before anyone opens a settings sheet. See `lib/install.ts`.
        captureInstallPrompt()
        // A shared receipt nobody came back for. Every normal exit discards it; this covers the
        // ones nobody takes, so a photo cannot outlive the share that parked it.
        void sweepSharedReceipt(caches)
    }, [])

    // On mount and on every return to the app. Both events: `visibilitychange` covers a phone
    // being unlocked back into Split, `focus` covers a desktop window that was never hidden, only
    // behind another one.
    useEffect(() => {
        clearAppBadge()
        const onBack = () => {
            if (document.visibilityState === 'visible') clearAppBadge()
        }
        document.addEventListener('visibilitychange', onBack)
        window.addEventListener('focus', onBack)
        return () => {
            document.removeEventListener('visibilitychange', onBack)
            window.removeEventListener('focus', onBack)
        }
    }, [])

    // Mirrors `animationsEnabled` onto <html> for the CSS-keyframe half of the
    // animation catalog. Here rather than in the room, because drawers portal
    // outside it and the landing page animates too.
    useAnimationPreferenceClass()

    /**
     * Re-assert the language on every boot, including the very first visit where the locale came
     * from Accept-Language and no cookie exists yet. iOS caps script-written cookies at ~7 days
     * rolling, so without this a chosen language quietly expires between trips.
     */
    useEffect(() => {
        // Only where the cookie is the authority. An indexed page states its language in its URL,
        // and writing that to the cookie lets one visit to a Portuguese guide re-language the app
        // for a reader who never asked for it.
        if (localeFromPathname(pathname)) return
        writeLocaleCookie(asLocale(locale))
    }, [locale, pathname])

    return (
        // The root policy catches every motion/react surface, including a new
        // component that forgets to call `useMotionAllowed()` itself. Explicit
        // component guards still prevent hidden first frames; this is the
        // accessibility backstop and the in-app quiet-mode switch.
        <MotionConfig reducedMotion={motionAllowed ? 'never' : 'always'}>
            <QueryClientProvider client={queryClient}>
                <NuqsAdapter>
                    {children}
                    <OfflineQueueRunner />
                    <PushNavigation />
                    <Toaster
                        position="top-center"
                        // The floor, not the rule: anything that asks for an action
                        // passes its own duration from TOAST_MS at the call site.
                        duration={TOAST_MS.default}
                        toastOptions={{
                            // Sonner's styled mode wins on selector specificity,
                            // reintroducing its soft shadow and 8px radius over
                            // these classes. Own the primitive completely so a
                            // toast follows the same hard-edged DS as the room.
                            unstyled: true,
                            classNames: {
                                toast: 'shadow-4 flex w-full items-start gap-3 rounded-sm border border-n-1 bg-white p-4 font-sans text-sm text-n-1',
                                content: 'flex min-w-0 flex-1 flex-col gap-1',
                                title: 'font-bold',
                                description: 'text-grey-1',
                                actionButton:
                                    'min-h-10 rounded-sm border border-n-1 bg-primary-1 px-3 font-bold text-n-1',
                                cancelButton: 'min-h-10 rounded-sm border border-n-1 bg-white px-3 font-bold text-n-1',
                                closeButton:
                                    'flex size-10 items-center justify-center rounded-sm border border-n-1 bg-white',
                            },
                        }}
                    />
                </NuqsAdapter>
            </QueryClientProvider>
        </MotionConfig>
    )
}
