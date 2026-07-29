'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { trackLanding } from '@/lib/analytics'
import { useMotionAllowed } from '@/lib/use-motion'
import { HeroCreateForm } from './HeroCreateForm'
import { PassTheLinkStage, type PassTheLinkStageState } from './PassTheLinkStage'

const STORY_STEPS: Array<{ state: PassTheLinkStageState; after: number }> = [
    { state: 'reply', after: 850 },
    { state: 'link', after: 1_550 },
    { state: 'complete', after: 4_300 },
]

/**
 * The room's viral loop in one fold: make the real link, pass it to the chat, let the group in.
 *
 * The stage is a one-shot illustration, not another version of the product. The form remains
 * the only interactive surface and the only thing here that can write data. Its public room-name
 * draft is lifted just far enough to keep the illustrated link honest.
 */
export function PassTheLinkHero() {
    const t = useTranslations('marketing.hero')
    const motionAllowed = useMotionAllowed()
    const [roomName, setRoomName] = useState('')
    const [stageState, setStageState] = useState<PassTheLinkStageState>('question')
    const settledEarlyRef = useRef(false)

    const settleStory = useCallback(() => {
        settledEarlyRef.current = true
        setStageState('complete')
    }, [])
    const completeStory = useCallback(() => {
        if (settledEarlyRef.current) return
        setStageState('complete')
        trackLanding('landing_preview_completed', 'pass_link')
    }, [])

    useEffect(() => {
        if (!motionAllowed) {
            settleStory()
            return
        }
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
    }, [completeStory, motionAllowed, settleStory])

    return (
        <section data-testid="pass-link-hero" className="pass-link-hero border-b border-n-1 bg-secondary-1 text-n-1">
            <div className="pass-link-hero-inner">
                <div className="pass-link-utility" aria-label={t('utilityBrand')}>
                    <span>{t('utilityBrand')}</span>
                    <span>{t('utilityTag')}</span>
                </div>

                <div className="pass-link-layout">
                    <div className="pass-link-copy">
                        <p className="pass-link-kicker">{t('eyebrow')}</p>
                        <h1 data-testid="pass-link-headline">{t('titleAccessible')}</h1>
                        <p className="pass-link-subtitle">{t('subtitle')}</p>
                    </div>

                    <PassTheLinkStage roomName={roomName} state={stageState} />

                    <div className="pass-link-form-wrap">
                        <HeroCreateForm
                            roomName={roomName}
                            onRoomNameChange={setRoomName}
                            onInteraction={settleStory}
                            variant="pass-link"
                            analyticsVariant="pass_link"
                        />
                    </div>
                </div>
            </div>
        </section>
    )
}

export default PassTheLinkHero
