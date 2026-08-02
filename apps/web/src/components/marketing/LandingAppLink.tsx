'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Doodle } from '@/components/ui/Doodle'
import { trackLanding } from '@/lib/analytics'
import { cn } from '@/lib/cn'
import { useFeedback } from '@/lib/use-settings'

/** The landing explains the product; this single handoff enters it without mutating room data. */
export function LandingAppLink({ variant = 'pass-link' }: { variant?: 'compact' | 'pass-link' }) {
    const t = useTranslations('marketing.hero')
    const feedback = useFeedback()

    useEffect(() => {
        trackLanding('landing_hero_exposed', variant === 'compact' ? 'control' : 'pass_link')
    }, [variant])

    return (
        <Link
            href="/app"
            data-testid="landing-app-link"
            onClick={() => feedback('whoosh')}
            className={cn(
                'shadow-primary-6 flex flex-col gap-3 rounded-sm border border-n-1 bg-white p-4 text-n-1 no-underline transition-transform active:translate-y-px active:shadow-none',
                variant === 'compact' ? 'mt-6' : 'pass-link-form'
            )}
        >
            <p className="text-sm leading-5 text-grey-1">{t('subtitle')}</p>
            <span className="btn btn-primary btn-shadow-primary-4 flex w-full items-center justify-center gap-2 text-h6">
                {t('cta')}
                <Doodle name="iconarrowright" size={22} weight={2.2} />
            </span>
        </Link>
    )
}
