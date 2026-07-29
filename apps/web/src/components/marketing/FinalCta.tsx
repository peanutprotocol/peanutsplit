'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/Button'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'
import { LANDING_CAST, LandingPersona } from './LandingPersona'

/**
 * The second and last ask on the page. The hero's CTA catches people who already knew what they
 * wanted; this one catches the ones who needed the four sections in between, and it names a
 * concrete occasion rather than repeating the hero's abstraction.
 *
 * Same button as the hero on purpose — a different-looking primary action at the bottom reads
 * as a different action.
 *
 * The supporting line names the next group expense without repeating the hero's trust claims.
 * It gives the broad headline a concrete job while the shared button still carries the ask.
 */
export function FinalCta() {
    const t = useTranslations('marketing.finalCta')
    const motionAllowed = useMotionAllowed()
    const feedback = useFeedback()

    return (
        <motion.section
            data-testid="final-cta"
            data-motion={motionAllowed ? 'ready' : 'still'}
            data-motion-surface
            initial={motionAllowed ? { opacity: 0, y: 24 } : false}
            animate={motionAllowed ? undefined : { opacity: 1, y: 0 }}
            whileInView={motionAllowed ? { opacity: 1, y: 0 } : undefined}
            viewport={{ once: true, amount: 0.45 }}
            transition={motionAllowed ? { type: 'spring', stiffness: 220, damping: 22 } : { duration: 0 }}
            className="mx-auto w-full max-w-xl px-5 py-10"
        >
            <div className="shadow-4 rounded-sm border border-n-1 bg-white p-5">
                <div className="mb-4 flex -space-x-2" aria-hidden="true">
                    <LandingPersona persona={LANDING_CAST.bea} size={40} />
                    <LandingPersona persona={LANDING_CAST.jules} size={40} />
                    <LandingPersona persona={LANDING_CAST.you} size={40} />
                </div>
                <h2 className="text-h5">{t('title')}</h2>
                <p className="mt-2 text-sm leading-5 text-grey-1">{t('subtitle')}</p>
                <Link href="/new" className="mt-4 block" onClick={() => feedback('whoosh')}>
                    <Button variant="primary" shadowSize="4" className="justify-center text-h6" disableHaptics>
                        {t('button')}
                    </Button>
                </Link>
            </div>
        </motion.section>
    )
}

export default FinalCta
