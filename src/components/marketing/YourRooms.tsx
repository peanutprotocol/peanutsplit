'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { readRecentRooms, type RecentRoom } from '@/lib/recent-rooms'
import { marketingCopy } from './copy'

const { rooms: copy } = marketingCopy

const VISIBLE = 5

const relativeTime = (epochMs: number): string => {
    if (!epochMs) return ''
    const minutes = Math.round((epochMs - Date.now()) / 60_000)
    const abs = Math.abs(minutes)
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
    if (abs < 60) return format.format(minutes, 'minute')
    if (abs < 60 * 24) return format.format(Math.round(minutes / 60), 'hour')
    if (abs < 60 * 24 * 30) return format.format(Math.round(minutes / (60 * 24)), 'day')
    return format.format(Math.round(minutes / (60 * 24 * 30)), 'month')
}

/**
 * "Your rooms" — the only personalisation the landing page has, since there are no accounts.
 * Reads localStorage after mount (never during render, so SSR and hydration agree) and
 * renders nothing at all when the device has no history.
 */
export function YourRooms() {
    const [recent, setRecent] = useState<RecentRoom[]>([])

    useEffect(() => {
        setRecent(readRecentRooms())
    }, [])

    if (recent.length === 0) return null

    const visible = recent.slice(0, VISIBLE)
    const overflow = recent.length - visible.length

    return (
        <section className="mx-auto w-full max-w-xl px-5">
            <div className="flex items-baseline justify-between">
                <h2 className="text-h5">{copy.title}</h2>
                <span className="text-sm text-grey-1">{copy.subtitle}</span>
            </div>

            <ul className="mt-4 flex flex-col gap-3">
                {visible.map((room) => (
                    <li key={room.slug}>
                        <Link
                            href={`/r/${room.slug}`}
                            aria-label={`${copy.openLabel}: ${room.name}`}
                            className="shadow-4 flex items-center gap-3 rounded-sm border border-n-1 bg-white p-3 transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                        >
                            <span
                                aria-hidden="true"
                                className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-primary-3 text-h5"
                            >
                                {room.emoji || '🥜'}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-h7">{room.name}</span>
                                <span className="block text-sm text-grey-1">{relativeTime(room.lastSeenAt)}</span>
                            </span>
                            <Icon name="chevron-right" size={20} className="shrink-0 text-n-1" />
                        </Link>
                    </li>
                ))}
            </ul>

            {overflow > 0 && (
                <p className="mt-3 text-sm text-grey-1">{copy.moreLabel.replace('{count}', String(overflow))}</p>
            )}
        </section>
    )
}

export default YourRooms
