import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { buttonClassName } from '@/components/ui/button-style'
import { RouteState } from '@/components/ui/RouteState'

export default async function NotFound() {
    const t = await getTranslations('routeStates.notFound')

    return (
        <RouteState eyebrow={t('eyebrow')} title={t('title')} body={t('body')} testId="route-not-found">
            <Link
                href="/app"
                className={buttonClassName({
                    shadowSize: '3',
                    width: 'auto',
                    className: 'justify-center no-underline',
                })}
            >
                {t('action')}
            </Link>
        </RouteState>
    )
}
