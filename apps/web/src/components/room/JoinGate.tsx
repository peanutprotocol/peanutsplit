'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { isApiError } from '@/lib/api'
import type { RoomState } from '@/lib/api-types'
import { roomProps, track } from '@/lib/analytics'
import type { MemberIdentity } from '@/lib/identity'
import { useErrorMessage } from '@/lib/error-messages'
import { useJoinRoom } from '@/lib/queries'
import { useFeedback } from '@/lib/use-settings'
import { useShake } from '@/hooks/useShake'
import { MemberAvatar } from './MemberAvatar'

interface JoinGateProps {
    slug: string
    state: RoomState
    onJoined: (identity: MemberIdentity) => void
}

/**
 * First visit, no stored identity. The room is already visible behind this — you
 * can see the balances you are about to join, which is most of the trust.
 *
 * Tapping an existing member claims that identity locally only: there is no
 * token for someone else's member, and that is by design. Impersonation inside a
 * trusted circle is a category norm (Kittysplit, Splid) and the slug is the
 * credential; writes are attributed, never authorised.
 */
export function JoinGate({ slug, state, onJoined }: JoinGateProps) {
    const t = useTranslations('room.join')
    const errorMessage = useErrorMessage()
    const joinRoom = useJoinRoom(slug)
    const feedback = useFeedback()
    const { ref: cardRef, shake } = useShake<HTMLDivElement>()
    const [mode, setMode] = useState<'pick' | 'new'>(state.members.length > 0 ? 'pick' : 'new')
    const [name, setName] = useState('')
    const [error, setError] = useState<string | null>(null)

    const claimExisting = (memberId: string, memberName: string) => {
        feedback('pop')
        track('room_joined', roomProps(slug, { kind: 'existing' }))
        onJoined({ memberId, name: memberName })
    }

    const joinAsNew = async (event: React.FormEvent) => {
        event.preventDefault()
        const trimmed = name.trim()
        if (!trimmed) return
        setError(null)
        try {
            const next = await joinRoom.mutateAsync({ name: trimmed })
            feedback('pop')
            track('room_joined', roomProps(slug, { kind: 'new' }))
            onJoined({ memberId: next.memberId, token: next.memberToken, name: trimmed })
        } catch (err) {
            // The card is the whole screen here; shaking it is the only motion
            // available, and the name field is what has to be looked at again.
            feedback('error', { haptic: 'error' })
            shake()
            if (isApiError(err, 'DUPLICATE_MEMBER_NAME')) {
                // Named rather than generic: this is the one error where the fix is a tap on
                // something already on screen, and pointing at it by name is the whole message.
                setError(t('duplicate', { name: trimmed }))
                setMode('pick')
                return
            }
            setError(errorMessage(err, t('failed')))
        }
    }

    return (
        <div className="fixed inset-0 z-30 flex flex-col justify-end" data-testid="join-gate">
            {/* Soft scrim: the room stays readable underneath on purpose. */}
            <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px]" aria-hidden="true" />

            <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                className="relative mx-auto w-full max-w-xl p-4"
            >
                {/* A plain wrapper for the shake rather than the motion.div above it:
                    motion writes `transform` inline on every render, and a CSS
                    keyframe animation on the same property is a fight, not a stack. */}
                <div ref={cardRef}>
                    <Card shadowSize="6" className="max-h-[80dvh] gap-5 overflow-y-auto p-4">
                        <div className="flex flex-col gap-1">
                            <h2 className="text-h5">{t('title')}</h2>
                            <p className="text-sm text-grey-1">
                                {t('roster', { room: state.room.name, count: state.members.length })}
                            </p>
                        </div>

                        {mode === 'pick' && (
                            <div className="flex flex-col gap-3">
                                <ul className="flex flex-col gap-2">
                                    {state.members.map((member) => (
                                        <li key={member.id}>
                                            <button
                                                type="button"
                                                onClick={() => claimExisting(member.id, member.name)}
                                                data-testid="claim-member"
                                                data-member={member.name}
                                                className="shadow-4 flex w-full items-center gap-3 rounded-sm border border-n-1 bg-white p-3 text-left transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                                            >
                                                <MemberAvatar name={member.name} size={32} />
                                                <span className="flex-1 truncate text-h8">{member.name}</span>
                                                <span className="text-sm text-grey-1">{t('thatsMe')}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>

                                {error && (
                                    <p role="alert" className="text-sm font-bold text-error">
                                        {error}
                                    </p>
                                )}

                                <Button
                                    variant="stroke"
                                    icon="plus"
                                    className="justify-center"
                                    onClick={() => {
                                        setError(null)
                                        setMode('new')
                                    }}
                                    data-testid="im-new"
                                >
                                    {t('imNew')}
                                </Button>
                            </div>
                        )}

                        {mode === 'new' && (
                            <form onSubmit={joinAsNew} className="flex flex-col gap-3">
                                <BaseInput
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder={t('namePlaceholder')}
                                    maxLength={80}
                                    autoFocus
                                    data-testid="join-name"
                                />
                                {error && (
                                    <p role="alert" className="text-sm font-bold text-error">
                                        {error}
                                    </p>
                                )}
                                <Button
                                    type="submit"
                                    variant="primary"
                                    shadowSize="4"
                                    disabled={name.trim().length === 0}
                                    loading={joinRoom.isPending}
                                    className="justify-center text-h6"
                                    data-testid="join-room"
                                >
                                    {t('submit')}
                                </Button>
                                {state.members.length > 0 && (
                                    <Button
                                        variant="stroke"
                                        className="justify-center"
                                        onClick={() => {
                                            setError(null)
                                            setMode('pick')
                                        }}
                                    >
                                        {t('alreadyOnList')}
                                    </Button>
                                )}
                            </form>
                        )}
                    </Card>
                </div>
            </motion.div>
        </div>
    )
}
