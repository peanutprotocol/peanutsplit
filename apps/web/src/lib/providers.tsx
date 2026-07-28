'use client'

import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Toaster } from 'sonner'
import { PushNavigation } from '@/components/pwa/PushNavigation'
import { initAnalytics } from './analytics'
import { ensureDeviceId } from './identity'

/**
 * The single client boundary at the root: React Query, nuqs' URL adapter, and
 * the toast host. Also mints the device id on first paint, so the claim flow
 * that ships after v1 finds a cookie already in place.
 */
export function Providers({ children }: { children: React.ReactNode }) {
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

    return (
        <QueryClientProvider client={queryClient}>
            <NuqsAdapter>
                {children}
                <PushNavigation />
                <Toaster
                    position="top-center"
                    toastOptions={{
                        className: 'rounded-sm border border-n-1 bg-white text-n-1 font-sans',
                    }}
                />
            </NuqsAdapter>
        </QueryClientProvider>
    )
}
