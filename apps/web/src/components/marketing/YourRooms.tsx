'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { Icon } from '@/components/ui/Icon'
import { readRecentRooms, type RecentRoom } from '@/lib/recent-rooms'

const VISIBLE = 5

/**
 * "3 hours ago" in whatever language the room list is being read in. Was pinned to 'en', which
 * put an English timestamp under a Portuguese room name.
 */
const relativeTime = (epochMs: number, locale: string): string => {
    if (!epochMs) return ''
    const minutes = Math.round((epochMs - Date.now()) / 60_000)
    const abs = Math.abs(minutes)
    const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
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
    const t = useTranslations('marketing.rooms')
    const locale = useLocale()
    const [recent, setRecent] = useState<RecentRoom[]>([])

    useEffect(() => {
        setRecent(readRecentRooms())
    }, [])

    if (recent.length === 0) return null

    const visible = recent.slice(0, VISIBLE)
    const overflow = recent.length - visible.length

    return (
        // The list can only exist after a localStorage read, so it necessarily
        // arrives one frame late. Staggering it in turns that unavoidable pop
        // into something that looks intended.
        <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="mx-auto w-full max-w-xl px-5"
        >
            <div className="flex items-baseline justify-between">
                <h2 className="text-h5">{t('title')}</h2>
                <span className="text-sm text-grey-1">{t('subtitle')}</span>
            </div>

            <ul className="mt-4 flex flex-col gap-3">
                {visible.map((room, index) => (
                    <motion.li
                        key={room.slug}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 30, delay: 0.05 + index * 0.05 }}
                    >
                        <Link
                            href={`/r/${room.slug}`}
                            aria-label={`${t('openLabel')}: ${room.name}`}
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
                                <span className="block text-sm text-grey-1">
                                    {relativeTime(room.lastSeenAt, locale)}
                                </span>
                            </span>
                            <Icon name="chevron-right" size={20} className="shrink-0 text-n-1" />
                        </Link>
                    </motion.li>
                ))}
            </ul>

            {overflow > 0 && <p className="mt-3 text-sm text-grey-1">{t('more', { count: overflow })}</p>}
        </motion.section>
    )
}

export default YourRooms
