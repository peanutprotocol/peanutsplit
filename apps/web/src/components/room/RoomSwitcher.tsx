'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { RoomEmblem } from '@/components/room/RoomEmblem'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody } from '@/components/ui/DrawerLayout'
import { Icon } from '@/components/ui/Icon'
import type { ApiRoom } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { readRecentRooms, type RecentRoom } from '@/lib/recent-rooms'
import { themeFor } from '@/lib/themes'

interface RoomSwitcherProps {
    open: boolean
    onClose: () => void
    onOpenSettings: () => void
    currentSettingsRef?: RefObject<HTMLButtonElement | null>
    room: ApiRoom
}

/**
 * The room chooser opened by the title in the top bar.
 *
 * The loaded room is always present and inert, even when local storage is empty
 * or blocked. Every other room retained on this device follows it; `DrawerBody`
 * owns the vertical scroll when the list reaches the storage cap. The final row
 * reaches creation, import and link recovery without making `/app` a room list
 * on every normal launch.
 */
export function RoomSwitcher({ open, onClose, onOpenSettings, currentSettingsRef, room }: RoomSwitcherProps) {
    const t = useTranslations('room.header')
    // A settings action replaces this drawer with another one. Its opener leaves
    // the tree, so this drawer must not restore focus over the settings drawer's
    // own autofocus as it closes.
    const openingSettingsRef = useRef(false)
    // Storage is client-only. Keeping the server/first-client render empty also
    // avoids a hydration mismatch on every device with remembered rooms.
    const [recent, setRecent] = useState<RecentRoom[]>([])

    useEffect(() => {
        if (!open) return
        // A route transition can remove the old portal before its close-focus
        // event fires. A newly opened picker must never inherit that stale flag.
        openingSettingsRef.current = false
        setRecent(readRecentRooms().filter((candidate) => candidate.slug !== room.slug))
    }, [open, room.slug])

    const roomMark = (candidate: { name: string; emoji?: string | null; theme?: string | null }) => (
        <span
            style={{ backgroundColor: themeFor(candidate.theme).field }}
            className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1"
            aria-hidden="true"
        >
            <RoomEmblem value={candidate.emoji} name={candidate.name} size={25} />
        </span>
    )

    const rowBodyClass = 'flex min-h-16 min-w-0 flex-1 items-center gap-2 p-2 text-left'
    const compoundRowClass = 'flex min-h-16 w-full overflow-hidden rounded-sm border border-n-1 bg-white'
    const settingsClass =
        'flex min-h-16 w-[6.5rem] shrink-0 flex-row items-center justify-center gap-1.5 border-l border-n-1 bg-white px-1 text-xs font-bold leading-none tracking-tight transition-colors hover:bg-primary-3 active:bg-primary-3'

    const beginSettingsTransition = () => {
        openingSettingsRef.current = true
    }

    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent
                data-testid="room-switcher-sheet"
                onCloseAutoFocus={(event) => {
                    if (!openingSettingsRef.current) return
                    openingSettingsRef.current = false
                    event.preventDefault()
                }}
            >
                <DrawerHeader className="flex flex-row items-end justify-between">
                    <DrawerTitle className="text-h5">{t('roomsTitle')}</DrawerTitle>
                    <CloseButton onClick={onClose} label={t('closeRoomSwitcher')} />
                </DrawerHeader>
                <DrawerBody>
                    <p className="text-sm text-grey-1">{t('switchRoomsHint')}</p>

                    <div className="flex flex-col gap-2">
                        <div role="group" aria-label={room.name} className={cn(compoundRowClass, 'bg-primary-3')}>
                            <div aria-current="page" data-testid="room-switcher-current" className={rowBodyClass}>
                                {roomMark(room)}
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-bold">{room.name}</span>
                                    <span className="block text-sm text-grey-1">{t('currentRoom')}</span>
                                </span>
                                <Icon name="check" size={18} className="shrink-0" aria-hidden="true" />
                            </div>
                            <button
                                ref={currentSettingsRef}
                                type="button"
                                onClick={() => {
                                    beginSettingsTransition()
                                    onOpenSettings()
                                }}
                                aria-label={t('openRoomSettings', { room: room.name })}
                                data-testid="room-switcher-settings"
                                data-slug={room.slug}
                                data-current="true"
                                className={settingsClass}
                            >
                                <Icon name="settings" size={20} aria-hidden="true" />
                                <span>{t('settingsAction')}</span>
                            </button>
                        </div>

                        {recent.map((candidate) => (
                            <div
                                key={candidate.slug}
                                role="group"
                                aria-label={candidate.name}
                                className={compoundRowClass}
                            >
                                <Link
                                    href={`/r/${encodeURIComponent(candidate.slug)}`}
                                    data-testid="room-switcher-tile"
                                    data-slug={candidate.slug}
                                    className={cn(
                                        rowBodyClass,
                                        'transition-transform duration-100 active:translate-y-[2px]'
                                    )}
                                >
                                    {roomMark(candidate)}
                                    <span className="min-w-0 flex-1 truncate font-bold">{candidate.name}</span>
                                    <Icon name="chevron-right" size={18} className="shrink-0" aria-hidden="true" />
                                </Link>
                                <Link
                                    href={`/r/${encodeURIComponent(candidate.slug)}?settings=1`}
                                    onClick={beginSettingsTransition}
                                    aria-label={t('openRoomSettings', { room: candidate.name })}
                                    data-testid="room-switcher-settings"
                                    data-slug={candidate.slug}
                                    className={settingsClass}
                                >
                                    <Icon name="settings" size={20} aria-hidden="true" />
                                    <span>{t('settingsAction')}</span>
                                </Link>
                            </div>
                        ))}

                        <Link
                            href="/app?manage=1"
                            data-testid="room-switcher-manage"
                            className={cn(
                                'flex min-h-16 w-full items-center gap-3 rounded-sm border border-n-1 p-2.5 text-left transition-transform duration-100',
                                'mt-1 bg-[var(--split-theme-field,#FFC900)] shadow-[3px_3px_0_var(--split-theme-ink,#211C17)] active:translate-y-[2px]'
                            )}
                        >
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white">
                                <Icon name="plus" size={22} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-bold">{t('addOrJoinRoom')}</span>
                                <span className="block truncate text-sm text-grey-1">{t('roomOptionsHint')}</span>
                            </span>
                            <Icon name="chevron-right" size={18} className="shrink-0" aria-hidden="true" />
                        </Link>
                    </div>

                    <p className="text-sm text-grey-1">
                        {recent.length > 0 ? t('recentRoomsNote') : t('noOtherRoomsNote')}
                    </p>
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}
