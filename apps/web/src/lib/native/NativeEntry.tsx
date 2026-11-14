'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The app's root screen: decides where a cold start or a hard load goes (ARCHITECTURE 4.3).
 * It renders nothing; the native splash covers it until the next screen commits.
 *
 * Stub until task 2C: always opens the rooms home.
 */
export function NativeEntry(): null {
    const router = useRouter()
    useEffect(() => {
        router.replace('/app/')
    }, [router])
    return null
}
