'use client'

import type { Ref } from 'react'
import { useTranslations } from 'next-intl'
import { CharacterSheet } from '@/components/room/CharacterSheet'
import { MemberAvatar } from '@/components/room/MemberAvatar'
import { RoomEmblem } from '@/components/room/RoomEmblem'
import { RoomSwitcher } from '@/components/room/RoomSwitcher'
import { SettingsSheet } from '@/components/room/SettingsSheet'
import { Icon } from '@/components/ui/Icon'
import type { ApiMember, ApiRoom, RoomState } from '@/lib/api-types'
import type { MemberIdentity } from '@/lib/identity'
import { useRoomParams } from '@/lib/room-params'

interface RoomHeaderProps {
    room: ApiRoom
    members: ApiMember[]
    /** Full room state, for surfaces that need the ledger (CSV/JSON export). */
    state: RoomState
    identity: MemberIdentity | null
    /** The roster row for `identity`, when this device is one of the members.
     *  Null while the room is still loading or when nobody has joined here. */
    me: ApiMember | null
    /** Stable room landmark used when a transient sheet removes its opener. */
    roomTitleRef?: Ref<HTMLButtonElement>
    onShare: () => void
    onForgetIdentity: () => void
}

/**
 * The room's top bar, and the two sheets it opens.
 *
 * Everything that used to live in this file — the roster, the character grid,
 * the device preferences, the export block — moved into `SettingsSheet` and its
 * parts. What is left is the bar itself: the emblem opens Settings, the title
 * opens room navigation, and share is share.
 */
export function RoomHeader({
    room,
    members,
    state,
    identity,
    me,
    roomTitleRef,
    onShare,
    onForgetIdentity,
}: RoomHeaderProps) {
    const t = useTranslations('room.header')
    const [sheets, setSheets] = useRoomParams()
    // Resolved rather than held, so a member disappearing under an open sheet
    // closes it instead of leaving a sheet about nobody — which is also what an
    // unknown or stale id in the URL does.
    const characterMember = members.find((member) => member.id === sheets.character) ?? null

    return (
        // The room's field colour, with the classic yellow as the literal
        // fallback — a room with no theme renders the exact bytes it did before
        // this variable existed.
        <header className="sticky top-0 z-10 border-b border-n-1 bg-[var(--split-theme-field,#FFC900)]">
            <div className="flex items-center gap-3 px-4 py-3">
                <button
                    type="button"
                    onClick={() => setSheets({ settings: true })}
                    aria-label={t('openSettings')}
                    data-testid="open-room-settings"
                    className="relative flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white text-h5"
                >
                    <RoomEmblem value={room.emoji} name={room.name} size={26} />
                    <span
                        aria-hidden="true"
                        className="absolute bottom-0 right-0 flex size-5 items-center justify-center rounded-full border border-n-1 bg-white"
                    >
                        <Icon name="settings" size={14} />
                    </span>
                </button>

                <h1 className="min-w-0 flex-1">
                    <button
                        ref={roomTitleRef}
                        type="button"
                        onClick={() => setSheets({ rooms: true })}
                        aria-haspopup="dialog"
                        aria-expanded={sheets.rooms}
                        aria-describedby="room-switcher-description"
                        data-testid="open-room-switcher"
                        className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-sm px-1 text-left hover:bg-white/30"
                    >
                        <span className="min-w-0 flex-1">
                            <span data-testid="room-title" className="block truncate text-h6">
                                {room.name}
                            </span>
                            <span className="flex min-w-0 items-center gap-1.5">
                                {me && (
                                    <MemberAvatar
                                        name={me.name}
                                        avatar={me.avatar}
                                        palette={me.avatarPalette}
                                        size={16}
                                    />
                                )}
                                <span className="truncate text-h10 uppercase tracking-wide text-n-1/70">
                                    {room.currency}
                                    {me
                                        ? ` · ${t('youAre', { name: me.name })}`
                                        : identity
                                          ? ` · ${t('youAre', { name: identity.name })}`
                                          : ''}
                                </span>
                            </span>
                        </span>
                        <Icon
                            name={sheets.rooms ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            className="shrink-0"
                            aria-hidden="true"
                        />
                    </button>
                </h1>
                <span id="room-switcher-description" className="sr-only">
                    {t('openRoomSwitcher')}
                </span>

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
                open={sheets.settings}
                onClose={() => setSheets({ settings: null })}
                room={room}
                members={members}
                state={state}
                identity={identity}
                me={me}
                onShare={onShare}
                onForgetIdentity={onForgetIdentity}
                onOpenCharacter={(memberId) => setSheets({ character: memberId })}
            />

            <RoomSwitcher
                open={sheets.rooms}
                onClose={() => setSheets({ rooms: null }, { history: 'replace' })}
                room={room}
            />

            <CharacterSheet
                open={characterMember !== null}
                onClose={() => setSheets({ character: null })}
                slug={room.slug}
                member={characterMember}
                members={members}
                token={identity?.token}
            />
        </header>
    )
}
