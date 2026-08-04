'use client'

import { useCallback, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { peanutSad } from '@/assets/mascot'
import { Button } from '@/components/ui/Button'
import { forgetRoom } from '@/lib/recent-rooms'

/** The bar is the room's first 69px and it only exists once the state does, so
 *  without a stand-in of the same height everything below it drops when the data
 *  lands (0.104 CLS on mobile). Same box, same paint, no content. */
export function RoomHeaderSkeleton() {
    return (
        <div
            aria-hidden="true"
            data-testid="room-header-skeleton"
            className="h-[69px] shrink-0 border-b border-n-1 bg-[var(--split-theme-field,#FFC900)]"
        />
    )
}

/** First paint. Skeletons, never a spinner — the shape of the room should be
 *  there before the numbers are. */
export function RoomSkeleton() {
    return (
        <div className="flex animate-pulse flex-col gap-6 pt-4" aria-hidden="true" data-testid="room-skeleton">
            <div className="flex gap-3 px-4">
                {[0, 1, 2].map((index) => (
                    <div key={index} className="h-28 w-[8.5rem] shrink-0 rounded-sm border border-n-4 bg-white" />
                ))}
            </div>
            <div className="flex flex-col gap-2 px-4">
                <div className="h-3 w-24 rounded-sm bg-n-4" />
                {[0, 1, 2].map((index) => (
                    <div key={index} className="h-16 rounded-sm border border-n-4 bg-white" />
                ))}
            </div>
        </div>
    )
}

export function RoomErrorState({ onRetry }: { onRetry: () => void }) {
    const t = useTranslations('room.states')

    return (
        <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
            {/* Always above the fold when it renders, and it is the LCP element —
                eager, or the error screen paints its own headline before its face. */}
            <Image src={peanutSad} alt="" unoptimized priority className="h-32 w-32 object-contain" />
            <p className="text-h5">{t('errorTitle')}</p>
            <p className="max-w-[20rem] text-sm text-grey-1">{t('errorBody')}</p>
            <Button variant="primary" shadowSize="4" className="justify-center text-h6" onClick={onRetry}>
                {t('retry')}
            </Button>
        </div>
    )
}

export function RoomNotFound({ slug }: { slug?: string }) {
    const t = useTranslations('room.states')
    const forgetMissingRoom = useCallback(() => {
        if (slug) forgetRoom(slug)
    }, [slug])

    // This state is rendered only after an authoritative miss: the room API
    // answered NOT_FOUND, or the recap query found no row. Remove that dead
    // destination before `/app` chooses the newest remembered room again.
    // The click repeats the idempotent removal synchronously so even an
    // immediate activation cannot race the passive effect. Its management URL
    // bypasses automatic resume, so a blocked storage write cannot form a loop.
    useEffect(() => {
        forgetMissingRoom()
    }, [forgetMissingRoom])

    return (
        <div className="flex flex-col items-center gap-4 px-4 py-16 text-center" data-testid="room-not-found">
            {/* Always above the fold when it renders, and it is the LCP element —
                eager, or the error screen paints its own headline before its face. */}
            <Image src={peanutSad} alt="" unoptimized priority className="h-32 w-32 object-contain" />
            <p className="text-h5">{t('notFoundTitle')}</p>
            <p className="max-w-[22rem] text-sm text-grey-1">{t('notFoundBody')}</p>
            <Link href="/app?manage=1" replace onClick={forgetMissingRoom} className="w-full max-w-xs">
                <Button variant="stroke" className="justify-center">
                    {t('notFoundCta')}
                </Button>
            </Link>
        </div>
    )
}
