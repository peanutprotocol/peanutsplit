'use client'

import { useTranslations } from 'next-intl'
import { Doodle } from '@/components/ui/Doodle'
import { slugStem } from '@/lib/slugify'

export type PassTheLinkStageState = 'question' | 'reply' | 'link' | 'complete'

export interface PassTheLinkStageProps {
    roomName: string
    state: PassTheLinkStageState
}

/**
 * A non-writing illustration of the handoff the real form creates.
 *
 * The whole visible scene is decorative. Its accessible equivalent is one quiet sentence,
 * rendered beside it, so an animation never turns into a stream of chat announcements. The URL
 * uses the same stemmer as room creation and leaves the credential tail unresolved on purpose.
 */
export function PassTheLinkStage({ roomName, state }: PassTheLinkStageProps) {
    const t = useTranslations('marketing.hero')
    const tCreate = useTranslations('room.create')
    const stem = roomName.trim() ? slugStem(roomName) : tCreate('namePlaceholderSlug')

    return (
        <div className="pass-link-stage-shell">
            <p data-testid="pass-link-stage-summary" className="sr-only">
                {t('stageSummary')}
            </p>

            <div data-testid="pass-link-stage" data-state={state} className="pass-link-stage" aria-hidden="true">
                <p className="pass-link-bubble pass-link-bubble-question">{t('chat.question')}</p>
                <p className="pass-link-bubble pass-link-bubble-reply">
                    {t('chat.reply')}
                    <Doodle name="reactionclap" size={16} weight={1.8} />
                </p>

                <div className="pass-link-bubble pass-link-bubble-url">
                    <b data-testid="pass-link-url">
                        peanutsplit.com/r/{stem}-<span>••••••</span>
                    </b>
                    <small>
                        {t('chat.linkPrompt')}
                        <Doodle name="iconarrowright" size={13} weight={2} className="-rotate-90" />
                    </small>
                </div>

                <p className="pass-link-bubble pass-link-bubble-reaction">{t('chat.reaction')}</p>

                <span className="pass-link-token">
                    <Doodle name="iconarrowright" size={22} weight={2.2} className="-rotate-45" />
                </span>
                <Doodle name="peanut" size={120} weight={1.45} className="pass-link-peanut" />
            </div>
        </div>
    )
}

export default PassTheLinkStage
