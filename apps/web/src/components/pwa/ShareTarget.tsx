'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { RoomEmblem } from '@/components/room/RoomEmblem'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { PageContainer } from '@/components/ui/PageContainer'
import { track } from '@/lib/analytics'
import { readRecentRooms, type RecentRoom } from '@/lib/recent-rooms'
import { discardSharedReceipt, hasSharedReceipt } from '@/lib/shared-receipt'
import { themeFor } from '@/lib/themes'

type Phase = 'checking' | 'unavailable' | 'expired' | 'empty' | 'pick'

/**
 * Where a photo shared in from the OS lands.
 *
 * The recent-room list is the only thing this accountless app knows about a device, so it is also
 * the whole set of destinations. One room means no decision and therefore no screen; two or more
 * get the list below; none of the other four phases is a dead end either — each one ends in a
 * button back into the app.
 *
 * The photo is discarded on every exit that is not a hand-off to a room. It is somebody's receipt,
 * and this app promises that a scanned photo is read once and never stored.
 */
export function ShareTarget({ enabled }: { enabled: boolean }) {
    const t = useTranslations('shareTarget')
    const router = useRouter()
    const [phase, setPhase] = useState<Phase>('checking')
    const [rooms, setRooms] = useState<RecentRoom[]>([])
    /** Set the instant a room is chosen, so the unmount below does not throw away the photo that
     *  room is navigating to read. */
    const handedOff = useRef(false)

    useEffect(() => {
        let cancelled = false
        const settle = (next: Phase, outcome: string) => {
            if (cancelled) return
            setPhase(next)
            track('share_target_opened', { outcome })
        }

        void (async () => {
            if (!enabled) {
                await discardSharedReceipt(caches)
                settle('unavailable', 'unavailable')
                return
            }
            if (!(await hasSharedReceipt(caches))) {
                settle('expired', 'expired')
                return
            }
            const recent = readRecentRooms()
            if (recent.length === 0) {
                await discardSharedReceipt(caches)
                settle('empty', 'no_rooms')
                return
            }
            if (cancelled) return
            if (recent.length === 1) {
                handedOff.current = true
                track('share_target_opened', { outcome: 'single' })
                // `replace`, never `push`: a consumed share must not be reachable by the back button.
                router.replace(`/r/${recent[0].slug}?add=1&shared=1`)
                return
            }
            setRooms(recent)
            settle('pick', 'picker')
        })()

        return () => {
            cancelled = true
        }
    }, [enabled, router])

    // Backing out of the picker, or closing the tab on it, leaves nothing behind.
    useEffect(() => {
        if (phase !== 'pick') return
        return () => {
            if (!handedOff.current) void discardSharedReceipt(caches)
        }
    }, [phase])

    if (phase === 'checking') return null

    return (
        <PageContainer>
            <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 p-4">
                <Icon name="receipt" size={28} />
                {phase === 'pick' ? (
                    <>
                        <h1 className="text-h5">{t('pick')}</h1>
                        <ul className="flex flex-col gap-2">
                            {rooms.map((room) => (
                                <li key={room.slug}>
                                    <button
                                        type="button"
                                        data-testid="share-target-room"
                                        onClick={() => {
                                            handedOff.current = true
                                            router.replace(`/r/${room.slug}?add=1&shared=1`)
                                        }}
                                        style={room.theme ? { backgroundColor: themeFor(room.theme).field } : undefined}
                                        className="flex min-h-11 w-full items-center gap-3 rounded-sm border border-n-1 p-3 text-left"
                                    >
                                        <RoomEmblem value={room.emoji} name={room.name} size={26} />
                                        <span className="min-w-0 flex-1 truncate text-h8">{room.name}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : (
                    <>
                        <h1 className="text-h5">
                            {phase === 'unavailable'
                                ? t('unavailable')
                                : phase === 'expired'
                                  ? t('expired')
                                  : t('empty')}
                        </h1>
                        {phase === 'empty' ? (
                            <Link href="/new" data-testid="share-target-start">
                                <Button variant="primary" shadowSize="4" className="justify-center">
                                    {t('start')}
                                </Button>
                            </Link>
                        ) : (
                            <Link href="/" data-testid="share-target-open">
                                <Button variant="stroke" className="justify-center">
                                    {t('open')}
                                </Button>
                            </Link>
                        )}
                    </>
                )}
            </main>
        </PageContainer>
    )
}
