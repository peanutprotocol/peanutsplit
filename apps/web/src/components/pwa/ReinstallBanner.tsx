'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CloseButton } from '@/components/ui/CloseButton'
import { CANONICAL_APP_HOST, CANONICAL_APP_ORIGIN, isLoopbackHost, LEGACY_APP_HOST } from '@/lib/domains'

/**
 * "The app moved" — shown ONLY inside an installed PWA still launching from the legacy
 * origin. A browser tab needs no telling (the redirects walk it across), but an
 * installed icon keeps its origin until the person installs again from the new one, and
 * its push subscription lives with the old service worker. Until they reinstall, this
 * card is the one place that says so.
 *
 * Dismissal is persisted under a `ps:`-prefixed key on purpose: it rides the handoff,
 * so a device that already said "got it" is not asked again on the other side.
 */
const DISMISSED_KEY = 'ps:reinstall-dismissed'

export function ReinstallBanner() {
    const t = useTranslations('cutover.reinstall')
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        // A build that is not cut over — same host both sides, or a dev/e2e loopback
        // canonical — has nowhere to send anyone.
        if (CANONICAL_APP_HOST === LEGACY_APP_HOST || isLoopbackHost(CANONICAL_APP_HOST)) return
        const host = window.location.hostname.toLowerCase()
        if (host !== LEGACY_APP_HOST && host !== `www.${LEGACY_APP_HOST}`) return
        if (!(window.matchMedia?.('(display-mode: standalone)').matches ?? false)) return
        try {
            if (window.localStorage.getItem(DISMISSED_KEY) !== null) return
        } catch {
            // Unreadable storage also means the dismissal could not have been saved —
            // showing again is the honest default.
        }
        setVisible(true)
    }, [])

    const dismiss = () => {
        setVisible(false)
        try {
            window.localStorage.setItem(DISMISSED_KEY, String(Date.now()))
        } catch {
            // Private mode: the card comes back next launch, which is acceptable.
        }
    }

    if (!visible) return null

    return (
        <div
            role="status"
            data-testid="reinstall-banner"
            className="fixed inset-x-0 bottom-0 z-40 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
            <div className="shadow-4 mx-auto flex w-full max-w-xl gap-3 rounded-sm border border-n-1 bg-white p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-sm leading-5">{t('message')}</p>
                    <a href={CANONICAL_APP_ORIGIN} className="text-sm font-bold underline">
                        {t('open')}
                    </a>
                </div>
                <CloseButton onClick={dismiss} label={t('dismiss')} className="-mr-2 -mt-2 self-start text-grey-1" />
            </div>
        </div>
    )
}
