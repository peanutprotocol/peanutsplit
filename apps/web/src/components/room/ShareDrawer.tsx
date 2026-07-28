'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent } from '@/components/ui/Drawer'
import { Icon } from '@/components/ui/Icon'
import { isApiError } from '@/lib/api'
import type { ApiMember, ApiRoom } from '@/lib/api-types'
import { useErrorMessage } from '@/lib/error-messages'
import { useAddMember } from '@/lib/queries'
import { useFeedback } from '@/lib/use-settings'
import { LinkMoment } from './LinkMoment'
import { MemberAvatar } from './MemberAvatar'

interface ShareDrawerProps {
    open: boolean
    onClose: () => void
    room: ApiRoom
    /** The roster as it stands. Shown as chips so "who is already in" is a fact
     *  on screen rather than something to remember. */
    members: readonly ApiMember[]
}

/** The link moment again, on demand — same artefact, reachable from the header. */
export function ShareDrawer({ open, onClose, room, members }: ShareDrawerProps) {
    const t = useTranslations('room.share')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const addMember = useAddMember(room.slug)
    /**
     * Collapsed until asked for. The link is the hero of this sheet and the thing
     * that actually gets the room populated; typing four names is the fallback
     * for the people who will not tap tonight, and a fallback that opens by
     * default competes with the thing it is a fallback for.
     */
    const [expanded, setExpanded] = useState(false)
    const [name, setName] = useState('')
    const [error, setError] = useState<string | null>(null)

    // The sheet opening gets the blip; the link leaving gets the whoosh, inside
    // LinkMoment. Two different events, two different cues.
    useEffect(() => {
        if (open) feedback('blip')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const add = async (event: React.FormEvent) => {
        event.preventDefault()
        const trimmed = name.trim()
        if (!trimmed) return
        setError(null)
        try {
            await addMember.mutateAsync({ name: trimmed })
            // Cleared rather than kept: the next name is a different name, and
            // the chip that just appeared is the receipt for this one.
            setName('')
            feedback('pop')
        } catch (err) {
            feedback('error', { haptic: 'error' })
            if (isApiError(err, 'DUPLICATE_MEMBER_NAME')) {
                // The roster is on screen directly above this field, so naming
                // the collision is the whole message — there is nothing to do
                // about it except look up.
                setError(t('addPeople.duplicate', { name: trimmed }))
                return
            }
            setError(errorMessage(err, t('addPeople.failed')))
        }
    }

    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent className="bg-background">
                <div className="flex flex-col gap-5 px-5 pb-10 pt-2">
                    <LinkMoment
                        slug={room.slug}
                        roomName={room.name}
                        emoji={room.emoji}
                        title={t('title')}
                        subtitle={t('subtitle')}
                    />

                    <div className="border-t border-dashed border-n-1 pt-4">
                        <button
                            type="button"
                            onClick={() => {
                                setError(null)
                                setExpanded((previous) => !previous)
                                feedback('tick')
                            }}
                            aria-expanded={expanded}
                            data-testid="add-people-toggle"
                            className="flex w-full items-center gap-2 text-left"
                        >
                            <Icon name="users" size={18} className="shrink-0" />
                            <span className="flex-1 text-h7">{t('addPeople.toggle')}</span>
                            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} className="shrink-0" />
                        </button>

                        <AnimatePresence initial={false}>
                            {expanded && (
                                <motion.div
                                    key="add-people"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex flex-col gap-3 pt-3">
                                        <p className="text-sm leading-5 text-grey-1">{t('addPeople.body')}</p>

                                        <ul className="flex flex-wrap gap-2" data-testid="add-people-roster">
                                            {members.map((member) => (
                                                <li
                                                    key={member.id}
                                                    data-testid="roster-chip"
                                                    data-member={member.name}
                                                    className="flex items-center gap-2 rounded-sm border border-n-1 bg-white py-1 pl-1 pr-3"
                                                >
                                                    <MemberAvatar name={member.name} size={24} />
                                                    <span className="max-w-[10rem] truncate text-sm">
                                                        {member.name}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>

                                        <form onSubmit={add} className="flex items-start gap-2">
                                            <BaseInput
                                                variant="sm"
                                                value={name}
                                                onChange={(event) => setName(event.target.value)}
                                                placeholder={t('addPeople.placeholder')}
                                                maxLength={80}
                                                aria-label={t('addPeople.placeholder')}
                                                data-testid="add-person-name"
                                            />
                                            <Button
                                                type="submit"
                                                variant="stroke"
                                                icon="plus"
                                                disabled={name.trim().length === 0}
                                                loading={addMember.isPending}
                                                className="h-10 w-auto shrink-0 justify-center px-4"
                                                data-testid="add-person"
                                            >
                                                {t('addPeople.add')}
                                            </Button>
                                        </form>

                                        {error && (
                                            <p role="alert" className="text-sm font-bold text-error">
                                                {error}
                                            </p>
                                        )}

                                        <p className="text-sm leading-5 text-grey-1">{t('addPeople.note')}</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    )
}
