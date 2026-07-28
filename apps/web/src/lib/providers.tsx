'use client'

import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLocale } from 'next-intl'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Toaster } from 'sonner'
import { PushNavigation } from '@/components/pwa/PushNavigation'
import { asLocale } from '@/i18n/locales'
import { initAnalytics } from './analytics'
import { ensureDeviceId } from './identity'
import { writeLocaleCookie } from './locale-cookie'
import { useOfflineQueueRunner } from './queries'
import { TOAST_MS } from './toasts'
import { useAnimationPreferenceClass } from './use-motion'

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
        writeLocaleCookie(asLocale(locale))
    }, [locale])

    return (
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
                        className: 'rounded-sm border border-n-1 bg-white text-n-1 font-sans',
                    }}
                />
            </NuqsAdapter>
        </QueryClientProvider>
    )
}
