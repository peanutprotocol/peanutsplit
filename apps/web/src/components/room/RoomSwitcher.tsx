'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { RoomEmblem } from '@/components/room/RoomEmblem'
import { Icon } from '@/components/ui/Icon'
import { readRecentRooms, type RecentRoom } from '@/lib/recent-rooms'
import { themeFor } from '@/lib/themes'

/**
 * The other rooms on this device, across the top of the settings sheet.
 *
 * The room you are in is never a tile here — it is the card directly below, and
 * two representations of one room on one screen is exactly the confusion this
 * layout exists to remove.
 *
 * With nothing to switch to there is no strip, no empty state and no apology.
 * `readRecentRooms()` also returns `[]` when storage is blocked, which is the
 * same branch and the same right answer: a device that cannot remember rooms has
 * no list to offer.
 */
export function RoomSwitcher({ currentSlug, onNavigate }: { currentSlug: string; onNavigate: () => void }) {
    const t = useTranslations('room.header')
    // Read after mount: the list is localStorage, and rendering it during the
    // server pass would be a hydration mismatch on every device that has one.
    const [rooms, setRooms] = useState<RecentRoom[]>([])

    useEffect(() => {
        setRooms(readRecentRooms().filter((room) => room.slug !== currentSlug))
    }, [currentSlug])

    if (rooms.length === 0) return null

    return (
        <section className="flex flex-col gap-2" data-testid="room-switcher">
            <span className="text-h8 uppercase tracking-wide text-grey-1">{t('switchRoom')}</span>
            <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {rooms.map((room) => (
                    <li key={room.slug}>
                        <Link
                            href={`/r/${room.slug}`}
                            onClick={onNavigate}
                            data-testid="room-switcher-tile"
                            data-slug={room.slug}
                            // Inline for the same reason the theme picker does it:
                            // the palette is data, so eight arbitrary Tailwind
                            // classes would have to be safelisted by hand.
                            style={{ backgroundColor: themeFor(room.theme).field }}
                            className="flex w-24 shrink-0 flex-col items-center gap-1 rounded-sm border border-n-1 p-2 transition-transform duration-100 active:translate-y-[2px]"
                        >
                            <RoomEmblem value={room.emoji} name={room.name} size={26} />
                            <span className="w-full truncate text-center text-xs">{room.name}</span>
                        </Link>
                    </li>
                ))}
                <li>
                    {/* Not a "+". A plus reads as "new room", and this goes to the
                        page that owns the full list and the paste-a-link recovery. */}
                    <Link
                        href="/"
                        onClick={onNavigate}
                        data-testid="room-switcher-all"
                        className="flex w-24 shrink-0 flex-col items-center gap-1 rounded-sm border border-dashed border-n-1 bg-white p-2 transition-transform duration-100 active:translate-y-[2px]"
                    >
                        <Icon name="arrow-right" size={26} />
                        <span className="w-full truncate text-center text-xs">{t('allRooms')}</span>
                    </Link>
                </li>
            </ul>
        </section>
    )
}
