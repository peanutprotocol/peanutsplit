'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MemberAvatar } from '@/components/room/MemberAvatar'
import { RemovePerson } from '@/components/room/RemovePerson'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { isApiError } from '@/lib/api'
import type { ApiMember } from '@/lib/api-types'
import { avatarArt } from '@/lib/avatars'
import { useErrorMessage } from '@/lib/error-messages'
import { useAddMember } from '@/lib/queries'
import { useFeedback } from '@/lib/use-settings'

const OPEN_KEY = 'ps:people-open'

const readOpen = (): boolean => {
    try {
        return window.localStorage.getItem(OPEN_KEY) !== '0'
    } catch {
        return true
    }
}

const writeOpen = (open: boolean): void => {
    try {
        window.localStorage.setItem(OPEN_KEY, open ? '1' : '0')
    } catch {
        // Blocked storage. The choice still holds for this session.
    }
}

/**
 * The room's one roster.
 *
 * There used to be two: a wrapped list of inert chips, and a horizontal strip of
 * the same names that was the only tappable copy. Now every row is the tap — it
 * opens that person's character sheet — and "Add someone" is the last row rather
 * than a form standing between the list and everything under it.
 *
 * A name also comes back OFF here, on the row that names the person. It used to
 * be reachable only from a collapsed section of the share sheet, which is where
 * you go to invite people, not to correct the list.
 *
 * Collapsing exists so a twelve-person room cannot own the sheet. Open is the
 * default and the choice persists, because whichever one you want you want every
 * time.
 */
export function PeopleSection({
    slug,
    members,
    token,
    onOpenCharacter,
}: {
    slug: string
    members: ApiMember[]
    token?: string | null
    onOpenCharacter: (memberId: string) => void
}) {
    const t = useTranslations('room.header')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const addMember = useAddMember(slug, token)
    // Server render must agree with the first client paint, so the stored choice
    // is read in an effect rather than during render.
    const [open, setOpen] = useState(true)
    const [adding, setAdding] = useState(false)
    const [personName, setPersonName] = useState('')
    const [personError, setPersonError] = useState<string | null>(null)

    useEffect(() => setOpen(readOpen()), [])

    const toggle = () => {
        const next = !open
        setOpen(next)
        writeOpen(next)
    }

    const addPerson = async (event: React.FormEvent) => {
        event.preventDefault()
        const name = personName.trim()
        if (!name || addMember.isPending) return
        if (members.some((member) => member.name.toLowerCase() === name.toLowerCase())) {
            setPersonError(t('personDuplicate', { name }))
            return
        }
        setPersonError(null)
        try {
            await addMember.mutateAsync({ name })
            setPersonName('')
            setAdding(false)
            feedback('pop')
        } catch (error) {
            feedback('error', { haptic: 'error' })
            if (isApiError(error, 'DUPLICATE_MEMBER_NAME')) {
                setPersonError(t('personDuplicate', { name }))
                return
            }
            setPersonError(errorMessage(error, t('personFailed')))
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                data-testid="people-toggle"
                className="flex min-h-11 items-center gap-2 self-start"
            >
                <span className="text-h8 uppercase tracking-wide">{t('people')}</span>
                {/* Same ink as the label beside it: one row, one colour. */}
                <span className="text-sm">{members.length}</span>
                <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
            </button>

            {open && (
                <ul className="flex flex-col gap-2" data-testid="people-list">
                    {members.map((member) => (
                        // `flex-wrap`, because the removal panel takes a line of
                        // its own under the row rather than covering it.
                        <li key={member.id} className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => onOpenCharacter(member.id)}
                                data-testid="person-row"
                                data-member={member.name}
                                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-sm border border-n-1 bg-white p-2 text-left transition-transform duration-100 active:translate-y-[2px]"
                            >
                                <MemberAvatar
                                    name={member.name}
                                    avatar={member.avatar}
                                    palette={member.avatarPalette}
                                    size={32}
                                />
                                <span className="min-w-0 flex-1 truncate text-h8">{member.name}</span>
                                <span className="min-w-0 shrink truncate text-sm text-grey-1">
                                    {avatarArt(member.avatar).label}
                                </span>
                                <Icon name="chevron-right" size={16} className="shrink-0" />
                            </button>
                            <RemovePerson slug={slug} member={member} token={token} />
                        </li>
                    ))}
                    <li>
                        {adding ? (
                            <form onSubmit={addPerson} className="flex items-start gap-2">
                                <BaseInput
                                    variant="sm"
                                    autoFocus
                                    value={personName}
                                    onChange={(event) => {
                                        setPersonName(event.target.value)
                                        setPersonError(null)
                                    }}
                                    placeholder={t('personNamePlaceholder')}
                                    maxLength={80}
                                    aria-label={t('personNamePlaceholder')}
                                    data-testid="add-person-name"
                                />
                                <Button
                                    type="submit"
                                    variant="stroke"
                                    size="medium"
                                    icon="plus"
                                    disabled={!personName.trim()}
                                    loading={addMember.isPending}
                                    width="auto"
                                    className="h-12 shrink-0 justify-center"
                                    data-testid="add-person-submit"
                                >
                                    {t('addPerson')}
                                </Button>
                            </form>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setAdding(true)}
                                data-testid="add-person"
                                className="flex min-h-11 w-full items-center gap-3 rounded-sm border border-dashed border-n-1 bg-white p-2 text-left transition-transform duration-100 active:translate-y-[2px]"
                            >
                                <span className="flex size-8 items-center justify-center">
                                    <Icon name="plus" size={20} />
                                </span>
                                <span className="text-h8">{t('addSomeone')}</span>
                            </button>
                        )}
                    </li>
                    {personError && (
                        <li>
                            <p role="alert" className="text-sm font-bold text-error">
                                {personError}
                            </p>
                        </li>
                    )}
                </ul>
            )}
        </div>
    )
}
