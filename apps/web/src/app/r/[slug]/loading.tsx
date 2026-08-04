'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { RouteState } from '@/components/ui/RouteState'

export default function LoadingRoom() {
    const t = useTranslations('routeStates.loading')

    return (
        <RouteState eyebrow={t('eyebrow')} title={t('title')} body={t('body')} role="status" testId="route-loading">
            <Link
                href="/app"
                className="min-h-11 px-2 py-3 text-sm font-bold underline decoration-2 underline-offset-4"
            >
                {t('exit')}
            </Link>
        </RouteState>
    )
}
