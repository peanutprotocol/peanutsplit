'use client'
import { RoomEmblem } from '@/components/room/RoomEmblem'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { Icon } from '@/components/ui/Icon'
import { readRecentRooms, type RecentRoom } from '@/lib/recent-rooms'
import { themeFor } from '@/lib/themes'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'

const COLLAPSED_LIMIT = 5

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
    const motionAllowed = useMotionAllowed()
    const feedback = useFeedback()
    const [recent, setRecent] = useState<RecentRoom[]>([])
    const [expanded, setExpanded] = useState(false)

    useEffect(() => {
        setRecent(readRecentRooms())
    }, [])

    if (recent.length === 0) return null

    // Hiding a single sixth room behind a passive "and 1 more" footer made the
    // list look truncated by accident. Six is still a compact history, so show
    // it outright; larger histories get an explicit reveal control.
    const collapsedLimit = recent.length === COLLAPSED_LIMIT + 1 ? recent.length : COLLAPSED_LIMIT
    const visible = expanded ? recent : recent.slice(0, collapsedLimit)
    const overflow = recent.length - visible.length
    const canCollapse = recent.length > collapsedLimit

    return (
        // The list can only exist after a localStorage read, so it necessarily
        // arrives one frame late. Staggering it in turns that unavoidable pop
        // into something that looks intended.
        <motion.section
            initial={motionAllowed ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={motionAllowed ? { type: 'spring', stiffness: 320, damping: 30 } : { duration: 0 }}
            data-motion={motionAllowed ? 'ready' : 'still'}
            data-testid="recent-rooms"
            className="mx-auto w-full max-w-xl px-5 py-10"
        >
            <div className="flex items-baseline justify-between">
                <h2 className="text-h5">{t('title')}</h2>
                <span className="text-sm text-grey-1">{t('subtitle')}</span>
            </div>

            <ul id="recent-room-list" data-testid="recent-room-list" className="mt-4 flex flex-col gap-3">
                {visible.map((room, index) => (
                    <motion.li
                        key={room.slug}
                        initial={motionAllowed ? { opacity: 0, y: 8 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                            motionAllowed
                                ? {
                                      type: 'spring',
                                      stiffness: 340,
                                      damping: 30,
                                      delay: 0.05 + index * 0.05,
                                  }
                                : { duration: 0 }
                        }
                    >
                        <Link
                            href={`/r/${room.slug}`}
                            onClick={() => feedback('whoosh')}
                            aria-label={`${t('openLabel')}: ${room.name}`}
                            className="shadow-4 flex items-center gap-3 rounded-sm border border-n-1 bg-white p-3 transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                        >
                            {/* The tile wears the room's own palette. Eight rooms rendered in
                                one lavender square are eight identical rows you have to READ;
                                the colour is the thing you actually recognise, and it is the
                                same colour the room's header will be a tap later. Lavender
                                stays the literal fallback, so an unthemed room is unchanged. */}
                            <span
                                aria-hidden="true"
                                style={room.theme ? { backgroundColor: themeFor(room.theme).field } : undefined}
                                className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-primary-3 text-h5"
                            >
                                <RoomEmblem value={room.emoji} size={30} />
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

            {canCollapse && (
                <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls="recent-room-list"
                    onClick={() => {
                        setExpanded((current) => !current)
                        feedback('blip')
                    }}
                    className="rounded-xs mt-4 inline-flex items-center gap-1.5 px-1 py-1 text-sm font-bold text-n-1 underline decoration-2 underline-offset-4 transition-transform active:translate-y-px"
                >
                    {expanded ? t('showLess') : t('showMore', { count: overflow })}
                    <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={17} />
                </button>
            )}
        </motion.section>
    )
}

export default YourRooms
