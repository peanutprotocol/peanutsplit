'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { AvatarPicker } from '@/components/room/AvatarPicker'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody } from '@/components/ui/DrawerLayout'
import { roomProps, track } from '@/lib/analytics'
import type { ApiMember } from '@/lib/api-types'
import { effectiveAvatarPaletteKey, type AvatarPaletteKey } from '@/lib/avatar-palettes'
import { avatarFamily } from '@/lib/avatars'
import { useErrorMessage } from '@/lib/error-messages'
import { useSetAvatar } from '@/lib/queries'
import { TOAST_MS } from '@/lib/toasts'
import { useFeedback } from '@/lib/use-settings'

const HINT_KEY = 'ps:character-hint'

/**
 * True the first time this device opens a character sheet, and never again.
 * "Anyone can change anyone's character" is a rule of the room, so it has to be
 * said once — and it stops being news the moment somebody has done it.
 */
function claimFirstOpen(): boolean {
    try {
        if (window.localStorage.getItem(HINT_KEY)) return false
        window.localStorage.setItem(HINT_KEY, '1')
        return true
    } catch {
        // Blocked storage cannot remember. One line every time beats never.
        return true
    }
}

/**
 * One member's character, in its own sheet titled with their name.
 *
 * Two ways in, and both land here directly: your own avatar chip in the room
 * header, and any person row in the settings sheet. Neither goes through a
 * member-selector strip — the roster you tapped IS the selector.
 */
export function CharacterSheet({
    open,
    onClose,
    slug,
    member,
    members,
    token,
}: {
    open: boolean
    onClose: () => void
    slug: string
    /** Null while the room reloads under an open sheet. */
    member: ApiMember | null
    /** Active roster; removed members never appear in the room state. */
    members: readonly ApiMember[]
    token?: string | null
}) {
    const t = useTranslations('room.avatar')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const setAvatar = useSetAvatar(slug, member?.id ?? '', token)
    const [firstOpen, setFirstOpen] = useState(false)
    const currentPalette = member ? effectiveAvatarPaletteKey(member.avatarPalette, member.avatar ?? member.name) : null
    const usedPalettes = member
        ? members
              .filter((candidate) => candidate.id !== member.id)
              .map((candidate) =>
                  effectiveAvatarPaletteKey(candidate.avatarPalette, candidate.avatar ?? candidate.name)
              )
        : []

    useEffect(() => {
        if (open) setFirstOpen(claimFirstOpen())
    }, [open])

    const chooseAvatar = (avatar: string, avatarPalette: AvatarPaletteKey) => {
        if (!member || (avatar === member.avatar && avatarPalette === member.avatarPalette)) return
        feedback('tick')
        // The FAMILY, never the key or target member: both are social detail that
        // analytics.ts exists to keep out of a funnel.
        track('avatar_changed', roomProps(slug, { family: avatarFamily(avatar) }))
        setAvatar.mutate(
            { avatar, avatarPalette },
            {
                onError: (error) => {
                    feedback('error')
                    toast.error(errorMessage(error, t('failed')), { duration: TOAST_MS.actionable })
                },
            }
        )
    }

    return (
        <Drawer open={open && !!member} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent data-testid="character-sheet">
                <DrawerHeader className="flex flex-row items-end justify-between">
                    <DrawerTitle className="text-h5">{member?.name ?? ''}</DrawerTitle>
                    <CloseButton onClick={onClose} label={t('close')} data-testid="close-character-sheet" />
                </DrawerHeader>
                <DrawerBody>
                    {firstOpen && <p className="text-sm text-grey-1">{t('firstOpen')}</p>}
                    {member && (
                        <AvatarPicker
                            name={member.name}
                            value={member.avatar}
                            palette={currentPalette}
                            usedPalettes={usedPalettes}
                            onChange={chooseAvatar}
                            disabled={setAvatar.isPending}
                        />
                    )}
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}
