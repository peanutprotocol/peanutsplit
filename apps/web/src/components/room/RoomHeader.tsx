'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CharacterSheet } from '@/components/room/CharacterSheet'
import { MemberAvatar } from '@/components/room/MemberAvatar'
import { RoomEmblem } from '@/components/room/RoomEmblem'
import { SettingsSheet } from '@/components/room/SettingsSheet'
import { Icon } from '@/components/ui/Icon'
import type { ApiMember, ApiRoom, RoomState } from '@/lib/api-types'
import type { MemberIdentity } from '@/lib/identity'

interface RoomHeaderProps {
    room: ApiRoom
    members: ApiMember[]
    /** Full room state, for surfaces that need the ledger (CSV/JSON export). */
    state: RoomState
    identity: MemberIdentity | null
    /** The roster row for `identity`, when this device is one of the members.
     *  Null while the room is still loading or when nobody has joined here. */
    me: ApiMember | null
    onShare: () => void
    onForgetIdentity: () => void
}

/**
 * The room's top bar, and the two sheets it opens.
 *
 * Everything that used to live in this file — the roster, the character grid,
 * the device preferences, the export block — moved into `SettingsSheet` and its
 * parts. What is left is the bar itself: the emblem opens Settings, your own
 * avatar chip opens YOUR character sheet, and share is share.
 */
export function RoomHeader({ room, members, state, identity, me, onShare, onForgetIdentity }: RoomHeaderProps) {
    const t = useTranslations('room.header')
    const tAvatar = useTranslations('room.avatar')
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [characterMemberId, setCharacterMemberId] = useState<string | null>(null)
    // Resolved rather than held, so a member disappearing under an open sheet
    // closes it instead of leaving a sheet about nobody.
    const characterMember = members.find((member) => member.id === characterMemberId) ?? null

    return (
        // The room's field colour, with the classic yellow as the literal
        // fallback — a room with no theme renders the exact bytes it did before
        // this variable existed.
        <header className="sticky top-0 z-10 border-b border-n-1 bg-[var(--split-theme-field,#FFC900)]">
            <div className="flex items-center gap-3 px-4 py-3">
                <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    aria-label={t('openSettings')}
                    data-testid="open-room-settings"
                    className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white text-h5"
                >
                    <RoomEmblem value={room.emoji} name={room.name} size={26} />
                </button>

                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-h6">{room.name}</h1>
                    {/* Two taps to your own character, and the second one is the
                        grid — never the settings sheet with a member preselected. */}
                    {me ? (
                        <button
                            type="button"
                            onClick={() => setCharacterMemberId(me.id)}
                            aria-label={tAvatar('open')}
                            data-testid="open-avatar"
                            className="-my-0.5 flex items-center gap-1.5 py-0.5"
                        >
                            <MemberAvatar name={me.name} avatar={me.avatar} size={16} />
                            <span className="truncate text-h10 uppercase tracking-wide text-n-1/70">
                                {`${room.currency} · ${t('youAre', { name: me.name })}`}
                            </span>
                        </button>
                    ) : (
                        <p className="text-h10 uppercase tracking-wide text-n-1/70">
                            {room.currency}
                            {identity ? ` · ${t('youAre', { name: identity.name })}` : ''}
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={onShare}
                    aria-label={t('shareRoomLink')}
                    data-testid="share-room"
                    className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white transition-transform active:translate-y-[2px]"
                >
                    <Icon name="share" size={18} />
                </button>
            </div>

            <SettingsSheet
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                room={room}
                members={members}
                state={state}
                identity={identity}
                me={me}
                onShare={onShare}
                onForgetIdentity={onForgetIdentity}
                onOpenCharacter={setCharacterMemberId}
            />

            <CharacterSheet
                open={characterMember !== null}
                onClose={() => setCharacterMemberId(null)}
                slug={room.slug}
                member={characterMember}
            />
        </header>
    )
}
