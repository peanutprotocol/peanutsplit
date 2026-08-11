'use client'

import { useLayoutEffect } from 'react'
import { recordCanonicalStandaloneLaunch } from '@/lib/install'

/**
 * A child layout effect runs before Providers' parent passive effect reads install state. The
 * repair surface deliberately omits this component: opening repair inside an old room shortcut
 * must not certify that shortcut as the canonical Split app.
 */
export function CanonicalAppLaunchMarker() {
    useLayoutEffect(() => {
        recordCanonicalStandaloneLaunch()
    }, [])

    return null
}
