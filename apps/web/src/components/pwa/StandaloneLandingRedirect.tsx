'use client'

import { useEffect } from 'react'
import { shouldRedirectStandaloneLanding } from '@/lib/app-entry'

/**
 * `start_url` handles normal launcher opens. This catches older installs and an in-app navigation
 * to `/` without hijacking the same URL in a browser tab. Deep links keep their own destination.
 */
export function StandaloneLandingRedirect() {
    useEffect(() => {
        const navigatorStandalone = (navigator as Navigator & { standalone?: boolean }).standalone
        const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false

        if (shouldRedirectStandaloneLanding(window.location.pathname, displayModeStandalone, navigatorStandalone)) {
            window.location.replace('/app')
        }
    }, [])

    return null
}
