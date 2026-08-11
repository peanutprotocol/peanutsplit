'use client'

import { useLayoutEffect } from 'react'
import { recordCanonicalStandaloneLaunch } from '@/lib/install'

/**
 * A child layout effect runs before Providers' parent passive effect reads install state.
 * `recordCanonicalStandaloneLaunch` independently proves that the initial document URL—not a
 * later client route—is the exact manifest start URL. Repair omits the marker as an extra
 * fail-closed boundary.
 */
export function CanonicalAppLaunchMarker() {
    useLayoutEffect(() => {
        recordCanonicalStandaloneLaunch()
    }, [])

    return null
}
