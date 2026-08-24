'use client'

import { useEffect } from 'react'
import { initGoogleAds } from '@/lib/google-ads'

/**
 * Mounts the Google Ads tag on one page. Renders nothing.
 *
 * Mounted per route rather than in `Providers`, which is the whole app: the tag belongs on the
 * pages an ad click can land on and the page a room is created from, and on no others. See
 * `lib/google-ads.ts` for why a room page is not one of them.
 */
export function GoogleAdsTag() {
    useEffect(() => {
        initGoogleAds()
    }, [])
    return null
}
