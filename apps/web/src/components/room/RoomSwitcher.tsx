'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { RoomEmblem } from '@/components/room/RoomEmblem'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { Icon } from '@/components/ui/Icon'
import type { ApiRoom } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { readRecentRooms, type RecentRoom } from '@/lib/recent-rooms'
import { themeFor } from '@/lib/themes'

interface RoomSwitcherProps {
    open: boolean
    onClose: () => void
    room: ApiRoom
}

/**
 * A deliberately small navigation sheet, not a second room chooser.
 *
 * The loaded room is always present and inert, even when local storage is empty
 * or blocked. At most two other rooms follow it, then one stable route to the
 * full chooser where creation, import and link recovery already live.
 */
export function RoomSwitcher({ open, onClose, room }: RoomSwitcherProps) {
    const t = useTranslations('room.header')
    // Storage is client-only. Keeping the server/first-client render empty also
    // avoids a hydration mismatch on every device with remembered rooms.
    const [recent, setRecent] = useState<RecentRoom[]>([])

    useEffect(() => {
        if (!open) return
        setRecent(
            readRecentRooms()
                .filter((candidate) => candidate.slug !== room.slug)
                .slice(0, 2)
        )
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

    const rowClass =
        'flex min-h-16 w-full items-center gap-3 rounded-sm border border-n-1 bg-white p-2.5 text-left transition-transform duration-100'

    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent className={drawerContentClass} data-testid="room-switcher-sheet">
                <DrawerHeader className={cn(drawerHeaderClass, 'flex flex-row items-end justify-between')}>
                    <DrawerTitle className="text-h5">{t('roomsTitle')}</DrawerTitle>
                    <CloseButton onClick={onClose} label={t('closeRoomSwitcher')} />
                </DrawerHeader>
                <DrawerBody>
                    <p className="text-sm text-grey-1">{t('switchRoomsHint')}</p>

                    <div className="flex flex-col gap-2">
                        <div
                            aria-current="page"
                            data-testid="room-switcher-current"
                            className={cn(rowClass, 'bg-primary-3')}
                        >
                            {roomMark(room)}
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-bold">{room.name}</span>
                                <span className="block text-sm text-grey-1">{t('currentRoom')}</span>
                            </span>
                            <Icon name="check" size={18} className="shrink-0" aria-hidden="true" />
                        </div>

                        {recent.map((candidate) => (
                            <Link
                                key={candidate.slug}
                                href={`/r/${candidate.slug}`}
                                data-testid="room-switcher-tile"
                                data-slug={candidate.slug}
                                className={cn(rowClass, 'active:translate-y-[2px]')}
                            >
                                {roomMark(candidate)}
                                <span className="min-w-0 flex-1 truncate font-bold">{candidate.name}</span>
                                <Icon name="chevron-right" size={18} className="shrink-0" aria-hidden="true" />
                            </Link>
                        ))}

                        <Link
                            href="/app"
                            data-testid="room-switcher-all"
                            className={cn(
                                rowClass,
                                'mt-1 bg-[var(--split-theme-field,#FFC900)] shadow-[3px_3px_0_var(--split-theme-ink,#211C17)] active:translate-y-[2px]'
                            )}
                        >
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-white">
                                <Icon name="arrow-right" size={22} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-bold">{t('allRooms')}</span>
                                <span className="block truncate text-sm text-grey-1">{t('allRoomsHint')}</span>
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
