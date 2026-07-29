'use client'

import { useTranslations } from 'next-intl'
import { Doodle } from '@/components/ui/Doodle'
import { slugStem } from '@/lib/slugify'
import { MessagingDoodle, type MessagingDoodleName } from './MessagingDoodle'

export type PassTheLinkStageState = 'question' | 'reply' | 'link' | 'complete'

export interface PassTheLinkStageProps {
    roomName: string
    state: PassTheLinkStageState
}

const CHANNELS: MessagingDoodleName[] = ['whatsapp', 'telegram', 'messenger', 'messages']
const PEOPLE = ['B', 'J', 'M', 'YOU'] as const

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

            <div data-testid="pass-link-stage" data-state={state} className="pass-link-stage" aria-hidden="true">
                <div data-testid="pass-link-channel-doodles" className="pass-link-channels">
                    {CHANNELS.map((channel) => (
                        <span
                            key={channel}
                            data-testid="pass-link-channel"
                            className={`pass-link-channel pass-link-channel-${channel}`}
                        >
                            <MessagingDoodle name={channel} />
                        </span>
                    ))}
                </div>

                <p data-testid="pass-link-no-signup" className="pass-link-stage-badge">
                    {t('chat.badge')}
                </p>

                <article data-testid="pass-link-chat-frame" className="pass-link-chat-frame">
                    <header className="pass-link-chat-header">
                        <div className="pass-link-chat-title">
                            <strong>{shownRoomName}</strong>
                            <small>{t('chat.participants')}</small>
                        </div>
                        <div className="pass-link-avatar-stack">
                            {PEOPLE.map((person) => (
                                <span key={person} className="pass-link-avatar">
                                    {person === 'YOU' ? t('chat.youShort') : person}
                                </span>
                            ))}
                        </div>
                    </header>

                    <div className="pass-link-chat-body">
                        <div className="pass-link-message-row pass-link-chat-question">
                            <span className="pass-link-mini-avatar">B</span>
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
                                <div className="pass-link-shared-brand">
                                    <span>{t('chat.linkBrand')}</span>
                                    <span className="pass-link-share-mark">
                                        <Doodle name="iconshare" size={21} weight={2} />
                                    </span>
                                </div>
                                <div className="pass-link-shared-main">
                                    <strong>{shownRoomName}</strong>
                                    <b data-testid="pass-link-url">
                                        peanutsplit.com/r/{stem}-<span>••••••</span>
                                    </b>
                                </div>
                                <div className="pass-link-shared-footer">
                                    <div className="pass-link-card-people">
                                        {PEOPLE.map((person) => (
                                            <span key={person} className="pass-link-avatar">
                                                {person === 'YOU' ? t('chat.youShort') : person}
                                            </span>
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
            </div>
        </div>
    )
}

export default PassTheLinkStage
