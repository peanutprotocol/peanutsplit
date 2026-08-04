'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { mostRecentRoomPath } from '@/lib/recent-rooms'

/**
 * Resolves the device-local app entry after hydration.
 *
 * The server cannot read localStorage, so rendering the chooser first would flash
 * the old home before a returning device moved to its room. Keep the fallback out
 * of the tree until the one client-side read says there is nowhere to redirect.
 */
export function RecentRoomAppEntry({ children }: { children: ReactNode }) {
    const router = useRouter()
    const [showFallback, setShowFallback] = useState(false)

    useEffect(() => {
        const roomPath = mostRecentRoomPath()
        if (roomPath) {
            router.replace(roomPath)
            return
        }
        setShowFallback(true)
    }, [router])

    return showFallback ? children : null
}
