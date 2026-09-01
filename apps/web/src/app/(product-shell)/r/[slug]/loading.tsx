'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { RouteState } from '@/components/ui/RouteState'

/** The reveal wrapper pairs `animate-route-reveal` (invisible for 400ms, then a
 *  200ms fade — a fast load never flashes this screen) with
 *  `data-motion-surface`, which both reduced-motion policies use to force
 *  `opacity: 1` when they strip the animation. Separate the two and
 *  reduced-motion users get an invisible loading screen. */
export default function LoadingRoom() {
    const t = useTranslations('routeStates.loading')

    return (
        <div className="animate-route-reveal" data-motion-surface>
            <RouteState eyebrow={t('eyebrow')} title={t('title')} body={t('body')} role="status" testId="route-loading">
                <Link
                    href="/app?manage=1"
                    className="min-h-11 px-2 py-3 text-sm font-bold underline decoration-2 underline-offset-4"
                >
                    {t('exit')}
                </Link>
            </RouteState>
        </div>
    )
}
