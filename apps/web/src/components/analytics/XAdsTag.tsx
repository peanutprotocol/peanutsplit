'use client'

import { useEffect } from 'react'
import { initXAds } from '@/lib/x-ads'

/**
 * Mounts the X Ads tag on one page. Renders nothing. Mounted exactly where `GoogleAdsTag` is, and
 * never on a room page — see `lib/google-ads.ts`.
 */
export function XAdsTag() {
    useEffect(() => {
        initXAds()
    }, [])
    return null
}
