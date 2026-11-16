'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Unknown in-app paths go to the rooms home; the app has no 404 screen of its own. */
export default function NativeNotFound() {
    const router = useRouter()
    useEffect(() => {
        router.replace('/app/')
    }, [router])
    return null
}
