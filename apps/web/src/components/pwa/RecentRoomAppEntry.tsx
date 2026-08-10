'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { restorePreparedInstallHandoff } from '@/lib/install-handoff'
import { mostRecentRoomPath } from '@/lib/recent-rooms'

/**
 * Resolves the device-local app entry after hydration.
 *
 * The server cannot read localStorage, so rendering the chooser first would flash
 * the old home before a returning device moved to its room. Keep the fallback out
 * of the tree until the client-side boot says there is nowhere to redirect.
 *
 * A newly-installed iOS app gets one extra boot branch: WebKit copied the prepared
 * cookie but not the Safari tab's localStorage, so redeem and verify that explicit
 * room before consulting any older installed-context history. A transient handoff
 * failure reveals the chooser instead of sending the person to a stale room.
 */
export function RecentRoomAppEntry({ children }: { children: ReactNode }) {
    const router = useRouter()
    const t = useTranslations('routeStates.loading')
    const [showFallback, setShowFallback] = useState(false)

    useEffect(() => {
        let current = true
        const controller = new AbortController()

        void (async () => {
            const handoff = await restorePreparedInstallHandoff(controller.signal)
            if (!current) return

            if (handoff.status === 'restored') {
                router.replace(handoff.roomPath)
                return
            }
            if (handoff.status === 'transient-failure') {
                setShowFallback(true)
                return
            }

            // No prepared row is definitive: the server also cleared the stale
            // marker, so this is now an ordinary app launch and existing history
            // is safe to consult.
            const roomPath = mostRecentRoomPath()
            if (roomPath) {
                router.replace(roomPath)
                return
            }
            setShowFallback(true)
        })()

        return () => {
            current = false
            controller.abort()
        }
    }, [router])

    if (showFallback) return children

    return (
        <main
            data-testid="app-boot"
            aria-busy="true"
            className="mx-auto flex min-h-dvh w-full max-w-xl items-center justify-center bg-background px-5"
        >
            <div
                role="status"
                aria-live="polite"
                className="shadow-2 rounded-sm border border-n-1 bg-white p-5 text-center"
            >
                <p className="text-h7">Split</p>
                <p className="mt-1 text-sm text-grey-1">{t('title')}</p>
            </div>
        </main>
    )
}
