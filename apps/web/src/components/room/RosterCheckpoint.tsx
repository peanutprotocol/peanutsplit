'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { isApiError } from '@/lib/api'
import type { ApiMember, RoomState } from '@/lib/api-types'
import { useErrorMessage } from '@/lib/error-messages'
import { useAddMember } from '@/lib/queries'
import { useFeedback } from '@/lib/use-settings'
import { MemberAvatar } from './MemberAvatar'

interface RosterCheckpointProps {
    state: RoomState
    onContinue: () => void
}

/**
 * The small bridge between creating a room and using it.
 *
 * Names added here are ordinary roster entries. The existing add-member mutation
 * keeps the room cache in sync while leaving the creator's device state alone.
 */
export function RosterCheckpoint({ state, onContinue }: RosterCheckpointProps) {
    const t = useTranslations('room.create.rosterCheckpoint')
    const errorMessage = useErrorMessage()
    const addMember = useAddMember(state.room.slug)
    const feedback = useFeedback()
    const inputRef = useRef<HTMLInputElement>(null)
    const [members, setMembers] = useState<readonly ApiMember[]>(state.members)
    const [name, setName] = useState('')
    const [error, setError] = useState<string | null>(null)
    // The add-member mutation writes straight into the room query, so `state` grows too.
    // "Somebody was added" is measured against the roster this checkpoint opened with.
    const [openedWith] = useState(state.members.length)
    const rosterChanged = members.length > openedWith

    const add = async (event: React.FormEvent) => {
        event.preventDefault()
        const trimmed = name.trim()
        if (!trimmed || addMember.isPending) return

        setError(null)
        try {
            const next = await addMember.mutateAsync({ name: trimmed })
            setMembers(next.state.members)
            setName('')
            feedback('pop')
            requestAnimationFrame(() => inputRef.current?.focus())
        } catch (err) {
            feedback('error', { haptic: 'error' })
            if (isApiError(err, 'DUPLICATE_MEMBER_NAME')) {
                setError(t('duplicate', { name: trimmed }))
                return
            }
            setError(errorMessage(err, t('failed')))
        }
    }

    return (
        <section
            className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-10"
            data-testid="roster-checkpoint"
        >
            <div className="flex flex-1 flex-col justify-center gap-6">
                <div className="flex flex-col gap-2 text-center">
                    <h1 className="text-h4">{t('title')}</h1>
                    <p className="text-sm text-grey-1">{t('subtitle')}</p>
                </div>

                <Card shadowSize="6" className="gap-4 p-4">
                    <ul className="flex flex-wrap gap-2" aria-label={t('title')}>
                        {members.map((member) => (
                            <li
                                key={member.id}
                                className="flex min-h-11 min-w-0 items-center gap-2 rounded-sm border border-n-1 bg-white px-3 py-2"
                                data-testid="checkpoint-member"
                                data-member={member.name}
                            >
                                <MemberAvatar name={member.name} avatar={member.avatar} size={27} />
                                <span className="max-w-[12rem] truncate text-h8">{member.name}</span>
                            </li>
                        ))}
                    </ul>

                    <form onSubmit={add} className="flex items-start gap-2">
                        <BaseInput
                            ref={inputRef}
                            variant="sm"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder={t('namePlaceholder')}
                            aria-label={t('namePlaceholder')}
                            maxLength={80}
                            autoComplete="off"
                            data-testid="checkpoint-name"
                        />
                        <Button
                            type="submit"
                            variant="stroke"
                            size="medium"
                            shape="square"
                            icon="plus"
                            loading={addMember.isPending}
                            disabled={!name.trim()}
                            aria-label={t('add')}
                            className="shrink-0 justify-center"
                            data-testid="checkpoint-add"
                        />
                    </form>

                    {error && (
                        <p role="alert" className="min-w-0 break-words text-sm font-bold text-error">
                            {error}
                        </p>
                    )}
                </Card>

                <Button
                    variant={rosterChanged ? 'primary' : 'stroke'}
                    shadowSize={rosterChanged ? '4' : undefined}
                    onClick={onContinue}
                    disabled={addMember.isPending}
                    className="justify-center text-h6"
                    data-testid="go-to-room"
                >
                    {rosterChanged ? t('done') : t('skip')}
                </Button>
            </div>
        </section>
    )
}
