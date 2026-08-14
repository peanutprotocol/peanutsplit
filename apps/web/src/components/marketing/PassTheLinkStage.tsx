'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Doodle } from '@/components/ui/Doodle'
import { SLUG_TAIL_HINT, slugStem } from '@/lib/slugify'
import { LANDING_CAST, LandingPersona } from './LandingPersona'

export type PassTheLinkStageState = 'question' | 'reply' | 'link' | 'complete'

export interface PassTheLinkStageProps {
    roomName: string
    state: PassTheLinkStageState
}

const PEOPLE = [
    { key: 'bea', persona: LANDING_CAST.bea },
    { key: 'jules', persona: LANDING_CAST.jules },
    { key: 'mo', persona: LANDING_CAST.mo },
    { key: 'you', persona: LANDING_CAST.you },
] as const

/**
 * A non-writing illustration of the handoff the real form creates.
 *
 * This is deliberately the distribution context, not a second product mockup: one recognisable
 * conversation, one dominant room card, and the people it reaches. The whole visible scene is
 * decorative. Its accessible equivalent is one quiet sentence, rendered beside it, so an
 * animation never turns into a stream of chat announcements. The URL uses the same stemmer as
 * room creation and leaves the credential tail unresolved on purpose.
 */
export function PassTheLinkStage({ roomName, state }: PassTheLinkStageProps) {
    const t = useTranslations('marketing.hero')
    const tCreate = useTranslations('room.create')
    const stem = roomName.trim() ? slugStem(roomName) : tCreate('namePlaceholderSlug')
    const shownRoomName = roomName.trim() || t('chat.defaultRoom')

    return (
        <div className="pass-link-stage-shell">
            <p data-testid="pass-link-stage-summary" className="sr-only">
                {t('stageSummary')}
            </p>

            <div data-testid="pass-link-stage" data-state={state} className="pass-link-stage">
                <Link
                    href="/new"
                    aria-label={t('cta')}
                    data-testid="pass-link-chat-link"
                    className="pass-link-chat-link"
                >
                    <article data-testid="pass-link-chat-frame" className="pass-link-chat-frame" aria-hidden="true">
                        <header className="pass-link-chat-header">
                            <span className="pass-link-chat-group-mark">
                                <Doodle name="channelmessenger" size={24} weight={1.9} />
                                <i />
                            </span>
                            <div className="pass-link-chat-title">
                                <strong>{shownRoomName}</strong>
                                <small>{t('chat.participants')}</small>
                            </div>
                            <div className="pass-link-avatar-stack">
                                {PEOPLE.map((person) => (
                                    <LandingPersona
                                        key={person.key}
                                        persona={person.persona}
                                        className="pass-link-avatar"
                                    />
                                ))}
                            </div>
                        </header>

                        <div className="pass-link-chat-body">
                            <div className="pass-link-message-row pass-link-chat-question">
                                <LandingPersona persona={LANDING_CAST.bea} className="pass-link-mini-avatar" />
                                <div>
                                    <small>{t('chat.questionSender')}</small>
                                    <p className="pass-link-message">{t('chat.question')}</p>
                                </div>
                            </div>

                            <div className="pass-link-message-row pass-link-message-row-outgoing pass-link-chat-reply">
                                <div>
                                    <small>{t('chat.you')}</small>
                                    <p className="pass-link-message">{t('chat.reply')}</p>
                                </div>
                            </div>

                            <div className="pass-link-shared-wrap">
                                <div className="pass-link-shared-card">
                                    <span className="pass-link-share-mark">
                                        <Doodle name="iconshare" size={21} weight={2} />
                                    </span>
                                    <div className="pass-link-shared-main">
                                        <strong>{shownRoomName}</strong>
                                        <b data-testid="pass-link-url">
                                            peanutsplit.com/r/{stem}
                                            <span>{SLUG_TAIL_HINT}</span>
                                        </b>
                                    </div>
                                    <div className="pass-link-shared-footer">
                                        <div className="pass-link-card-people">
                                            {PEOPLE.map((person) => (
                                                <LandingPersona
                                                    key={person.key}
                                                    persona={person.persona}
                                                    className="pass-link-avatar"
                                                />
                                            ))}
                                        </div>
                                        <strong>
                                            {t('chat.linkPrompt')}
                                            <span>
                                                <Doodle name="iconarrowright" size={16} weight={2.2} />
                                            </span>
                                        </strong>
                                    </div>
                                </div>
                            </div>

                            <p className="pass-link-joined">
                                <span>
                                    <Doodle name="iconcheck" size={14} weight={2.2} />
                                </span>
                                {t('chat.joined')}
                            </p>
                        </div>
                    </article>
                </Link>
            </div>
        </div>
    )
}

export default PassTheLinkStage
