'use client'

import { useRef, type RefObject } from 'react'
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
import { activeMember } from '@/lib/members'

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
    roomTitleRef?: RefObject<HTMLButtonElement | null>
    onShare: () => void
    onForgetIdentity: () => void
    /** JoinGate owns the viewport while this device reclaims an identity. */
    suspended?: boolean
}

/**
 * The room's top bar, and the two sheets it opens.
 *
 * Everything that used to live in this file — the roster, the character grid,
 * the device preferences, the export block — moved into `SettingsSheet` and its
 * parts. What is left is the bar itself: the emblem identifies the room, the
 * title opens room navigation, and share is share. The room emblem opens the
 * current room's settings directly; the room picker repeats that path beside
 * each saved room, where its scope is explicit.
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
    suspended = false,
}: RoomHeaderProps) {
    const t = useTranslations('room.header')
    const [sheets, setSheets] = useRoomParams()
    const internalRoomTitleRef = useRef<HTMLButtonElement>(null)
    const stableRoomTitleRef = roomTitleRef ?? internalRoomTitleRef
    const headerSettingsRef = useRef<HTMLButtonElement>(null)
    const currentRoomSettingsRef = useRef<HTMLButtonElement>(null)
    // Resolved rather than held, so a member disappearing under an open sheet
    // closes it instead of leaving a sheet about nobody — which is also what an
    // unknown or stale id in the URL does.
    const characterMember = sheets.character ? (activeMember(members, sheets.character) ?? null) : null

    return (
        // The room's field colour, with the classic yellow as the literal
        // fallback — a room with no theme renders the exact bytes it did before
        // this variable existed.
        <header className="sticky top-0 z-10 border-b border-n-1 bg-[var(--split-theme-field,#FFC900)]">
            <div className="flex items-center gap-3 px-4 py-3">
                <button
                    ref={headerSettingsRef}
                    type="button"
                    onClick={() => setSheets({ settings: true })}
                    aria-label={t('openSettings')}
                    aria-haspopup="dialog"
                    aria-expanded={sheets.settings}
                    data-testid="open-room-settings"
                    className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white"
                >
                    <span aria-hidden="true" data-testid="room-header-emblem">
                        <RoomEmblem value={room.emoji} name={room.name} size={26} />
                    </span>
                </button>

                <h1 className="min-w-0 flex-1">
                    <button
                        ref={stableRoomTitleRef}
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
                open={sheets.settings && !suspended}
                onClose={() => setSheets({ settings: null }, { history: 'replace' })}
                onCloseFocus={() => {
                    // Browser Back can restore the picker and its exact opener.
                    // X/Escape from the direct path returns to the emblem, which
                    // remains connected while the Settings drawer is open.
                    const target = sheets.rooms ? currentRoomSettingsRef.current : headerSettingsRef.current
                    target?.focus({ preventScroll: true })
                }}
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
                open={sheets.rooms && !suspended}
                onClose={() => setSheets({ rooms: null }, { history: 'replace' })}
                onOpenSettings={() => setSheets({ rooms: null, settings: true })}
                currentSettingsRef={currentRoomSettingsRef}
                room={room}
            />

            <CharacterSheet
                open={characterMember !== null && !suspended}
                onClose={() => setSheets({ character: null })}
                slug={room.slug}
                member={characterMember}
                members={members}
                token={identity?.token}
            />
        </header>
    )
}
