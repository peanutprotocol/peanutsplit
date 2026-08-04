'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { trackLanding } from '@/lib/analytics'
import { useMotionAllowed } from '@/lib/use-motion'
import { LandingAppLink } from './LandingAppLink'
import { PassTheLinkStage, type PassTheLinkStageState } from './PassTheLinkStage'

const STORY_STEPS: Array<{ state: PassTheLinkStageState; after: number }> = [
    { state: 'reply', after: 850 },
    { state: 'link', after: 1_550 },
    { state: 'complete', after: 4_300 },
]

/**
 * The room's viral loop in one fold: make the real link, pass it to the chat, let the group in.
 *
 * The stage is a one-shot illustration, not another version of the product. The only action hands
 * off to `/new`; the public page cannot write room data.
 */
export function PassTheLinkHero() {
    const t = useTranslations('marketing.hero')
    const motionAllowed = useMotionAllowed()
    const [stageState, setStageState] = useState<PassTheLinkStageState>('question')
    const completeStory = useCallback(() => {
        setStageState('complete')
        trackLanding('landing_preview_completed', 'pass_link')
    }, [])

    useEffect(() => {
        if (!motionAllowed) {
            // SSR starts still while the browser's media preference is unknown.
            // Show the complete meaning in that safe frame without marking it
            // as a user-settled story: a no-preference browser may progressively
            // enhance into the one-shot sequence after hydration.
            setStageState('complete')
            return
        }
        setStageState('question')
        const timeouts = STORY_STEPS.map(({ state, after }) =>
            window.setTimeout(() => {
                if (state === 'complete') {
                    completeStory()
                    return
                }
                setStageState((current) => (current === 'complete' ? current : state))
            }, after)
        )
        return () => timeouts.forEach((timeout) => window.clearTimeout(timeout))
    }, [completeStory, motionAllowed])

    return (
        <section data-testid="pass-link-hero" className="pass-link-hero border-b border-n-1 bg-secondary-1 text-n-1">
            <div className="pass-link-hero-inner">
                <div className="pass-link-layout">
                    <div className="pass-link-copy">
                        <h1 data-testid="pass-link-headline">{t('titleAccessible')}</h1>
                    </div>

                    <PassTheLinkStage roomName="" state={stageState} />

                    <div className="pass-link-form-wrap">
                        <LandingAppLink />
                    </div>
                </div>
            </div>
        </section>
    )
}

export default PassTheLinkHero
