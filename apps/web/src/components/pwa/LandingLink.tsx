'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Doodle } from '@/components/ui/Doodle'
import { landingLinkTarget } from '@/lib/app-entry'

/**
 * The way back from the accountless home to the landing, for someone who is only browsing.
 *
 * Renders as an ordinary in-tab link first — the server cannot see the display mode — and
 * switches to a new-tab link once the client knows it is running installed. A tap before
 * hydration in the app is not lost: it lands on `/`, which redirects back here.
 */
export function LandingLink() {
    const t = useTranslations('marketing.appHome')
    const [target, setTarget] = useState<'_blank' | undefined>(undefined)

    useEffect(() => {
        const navigatorStandalone = (navigator as Navigator & { standalone?: boolean }).standalone
        const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false
        setTarget(landingLinkTarget(displayModeStandalone, navigatorStandalone))
    }, [])

    return (
        <Link
            href="/"
            target={target}
            rel={target ? 'noopener noreferrer' : undefined}
            data-testid="app-landing-link"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-n-1 underline decoration-2 underline-offset-4"
        >
            {t('landingLink')}
            {target ? <Doodle name="iconarrowright" size={16} weight={2.4} className="-rotate-45" aria-hidden /> : null}
        </Link>
    )
}
