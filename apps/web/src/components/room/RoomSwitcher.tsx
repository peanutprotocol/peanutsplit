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
 *
 * Nothing here closes the sheet, and that is deliberate. Every drawer in the room
 * is a URL param (`?settings=1`), so closing one is itself a router push — and a
 * tile that both closed the sheet and followed its `href` fired two router pushes
 * from one click, where the query-param one won and the room never changed. The
 * targets carry no `settings` param, so arriving is what closes the sheet.
 */
export function RoomSwitcher({ currentSlug }: { currentSlug: string }) {
    const t = useTranslations('room.header')
    // Read after mount: the list is localStorage, and rendering it during the
    // server pass would be a hydration mismatch on every device that has one.
    const [rooms, setRooms] = useState<RecentRoom[]>([])

    useEffect(() => {
        setRooms(readRecentRooms().filter((room) => room.slug !== currentSlug))
    }, [currentSlug])

    if (rooms.length === 0) return null

    return (
        <section data-testid="room-switcher">
            {/* No heading. A row of rooms above the room you are in does not need a
                word to say what it is, and the label cost a line of the sheet. */}
            <ul
                // vaul owns the pointer inside a sheet: it sets `touch-action: none` on the drawer,
                // and touch-action resolves up the ancestor chain, so this strip could not be
                // panned by a finger at all. `data-vaul-no-drag` is vaul's own opt-out, and the
                // explicit `pan-x` hands horizontal panning back to the browser.
                data-vaul-no-drag
                // The scrollbar used to be hidden on both engines. On a phone that was survivable
                // once panning worked, but a mouse has no gesture to fall back on — the rooms past
                // the edge were simply unreachable. A thin bar is the affordance.
                className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] [touch-action:pan-x]"
            >
                {rooms.map((room) => (
                    <li key={room.slug}>
                        <Link
                            href={`/r/${room.slug}`}
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
                        href="/app"
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
