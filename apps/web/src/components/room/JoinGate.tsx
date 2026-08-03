'use client'

import { useEffect, useId, useRef, useState } from 'react'
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
import { useClaimMember, useJoinRoom } from '@/lib/queries'
import { useMotionAllowed } from '@/lib/use-motion'
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
 * Tapping an existing member asks the server for that roster entry's existing
 * token. The room link is still the credential: impersonation inside a trusted
 * circle is a category norm (Kittysplit, Splid), while the token lets reactions
 * and push bind to the identity this device selected.
 */
export function JoinGate({ slug, state, onJoined }: JoinGateProps) {
    const t = useTranslations('room.join')
    const errorMessage = useErrorMessage()
    const joinRoom = useJoinRoom(slug)
    const claimMember = useClaimMember(slug)
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()
    const gateRootRef = useRef<HTMLDivElement>(null)
    const dialogRef = useRef<HTMLDivElement>(null)
    const firstMemberRef = useRef<HTMLButtonElement>(null)
    const nameInputRef = useRef<HTMLInputElement>(null)
    const titleId = useId()
    const rosterId = useId()
    const { ref: cardRef, shake } = useShake<HTMLDivElement>()
    const [mode, setMode] = useState<'pick' | 'new'>(state.members.length > 0 ? 'pick' : 'new')
    const [name, setName] = useState('')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const gateRoot = gateRootRef.current
        const background = gateRoot?.parentElement
            ? Array.from(gateRoot.parentElement.children).filter(
                  (element): element is HTMLElement => element instanceof HTMLElement && element !== gateRoot
              )
            : []
        const priorAttributes = background.map((element) => ({
            element,
            inert: element.hasAttribute('inert'),
            ariaHidden: element.getAttribute('aria-hidden'),
        }))

        for (const element of background) {
            element.setAttribute('inert', '')
            element.setAttribute('aria-hidden', 'true')
        }

        return () => {
            for (const { element, inert, ariaHidden } of priorAttributes) {
                if (!inert) element.removeAttribute('inert')
                if (ariaHidden === null) element.removeAttribute('aria-hidden')
                else element.setAttribute('aria-hidden', ariaHidden)
            }
            if (previouslyFocused?.isConnected) previouslyFocused.focus()
        }
    }, [])

    useEffect(() => {
        const target = mode === 'pick' ? firstMemberRef.current : nameInputRef.current
        ;(target ?? dialogRef.current)?.focus()
    }, [mode])

    const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Tab') return

        const dialog = dialogRef.current
        if (!dialog) return

        const focusable = Array.from(
            dialog.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        )
        if (focusable.length === 0) {
            event.preventDefault()
            dialog.focus()
            return
        }

        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement
        if (event.shiftKey && (active === first || !dialog.contains(active))) {
            event.preventDefault()
            last.focus()
        } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
            event.preventDefault()
            first.focus()
        }
    }

    const claimExisting = async (memberId: string, memberName: string) => {
        setError(null)
        try {
            const next = await claimMember.mutateAsync({ memberId })
            feedback('pop')
            track('room_joined', roomProps(slug, { kind: 'existing' }))
            onJoined({ memberId: next.memberId, token: next.memberToken, name: memberName })
        } catch (err) {
            feedback('error', { haptic: 'error' })
            shake()
            setError(errorMessage(err, t('failed')))
        }
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
        // `h-svh` rather than `inset-0` alone. The small-viewport unit is the one that is never
        // taller than what the reader can actually see, and this gate is the only way into a
        // room: with four people already in it, a fifth on a 667px-tall phone had "I'm new"
        // painted below the fold, with neither the card nor the page able to scroll to it.
        <div
            ref={gateRootRef}
            className="fixed inset-0 z-30 flex h-svh flex-col justify-end overflow-y-auto"
            data-testid="join-gate"
        >
            {/* Soft scrim: the room stays readable underneath on purpose. */}
            <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px]" aria-hidden="true" />

            <motion.div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={rosterId}
                tabIndex={-1}
                onKeyDown={trapFocus}
                initial={motionAllowed ? { y: 40, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={motionAllowed ? { type: 'spring', stiffness: 280, damping: 26 } : { duration: 0 }}
                data-motion-surface
                className="relative mx-auto w-full max-w-xl p-4"
            >
                {/* A plain wrapper for the shake rather than the motion.div above it:
                    motion writes `transform` inline on every render, and a CSS
                    keyframe animation on the same property is a fight, not a stack. */}
                <div ref={cardRef}>
                    <Card shadowSize="6" className="max-h-[80svh] gap-5 overflow-y-auto p-4">
                        <div className="flex flex-col gap-1">
                            <h2 id={titleId} className="text-h5">
                                {t('title')}
                            </h2>
                            <p id={rosterId} className="text-sm text-grey-1">
                                {t('roster', { room: state.room.name, count: state.members.length })}
                            </p>
                        </div>

                        {mode === 'pick' && (
                            <div className="flex flex-col gap-3">
                                <ul className="flex flex-col gap-2">
                                    {state.members.map((member, index) => (
                                        <li key={member.id}>
                                            <button
                                                ref={index === 0 ? firstMemberRef : undefined}
                                                type="button"
                                                disabled={claimMember.isPending}
                                                onClick={() => void claimExisting(member.id, member.name)}
                                                data-testid="claim-member"
                                                data-member={member.name}
                                                className="shadow-4 flex w-full items-center gap-3 rounded-sm border border-n-1 bg-white p-3 text-left transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                                            >
                                                <MemberAvatar
                                                    name={member.name}
                                                    avatar={member.avatar}
                                                    palette={member.avatarPalette}
                                                    size={32}
                                                />
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
                                    ref={nameInputRef}
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder={t('namePlaceholder')}
                                    maxLength={80}
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
