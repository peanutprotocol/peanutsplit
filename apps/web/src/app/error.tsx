'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { buttonClassName } from '@/components/ui/button-style'
import { RouteState } from '@/components/ui/RouteState'

export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const t = useTranslations('routeStates.error')

    return (
        <RouteState eyebrow={t('eyebrow')} title={t('title')} body={t('body')} role="alert" testId="route-error">
            <button
                type="button"
                onClick={reset}
                className={buttonClassName({ shadowSize: '3', width: 'auto', className: 'justify-center' })}
            >
                {t('retry')}
            </button>
            <Link
                href="/app"
                className="min-h-11 px-2 py-3 text-sm font-bold underline decoration-2 underline-offset-4"
            >
                {t('exit')}
            </Link>
        </RouteState>
    )
}
