'use client'

import Image from 'next/image'
import Link from 'next/link'
import { peanutSad } from '@/assets/mascot'
import { Button } from '@/components/ui/Button'

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
    return (
        <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <Image src={peanutSad} alt="" unoptimized className="h-32 w-32 object-contain" />
            <p className="text-h5">We could not load this room</p>
            <p className="max-w-[20rem] text-sm text-grey-1">
                Probably a wobbly connection. Nothing is lost — try again.
            </p>
            <Button variant="primary" shadowSize="4" className="max-w-xs justify-center" onClick={onRetry}>
                Try again
            </Button>
        </div>
    )
}

export function RoomNotFound() {
    return (
        <div className="flex flex-col items-center gap-4 px-6 py-16 text-center" data-testid="room-not-found">
            <Image src={peanutSad} alt="" unoptimized className="h-32 w-32 object-contain" />
            <p className="text-h5">{`This split doesn't exist`}</p>
            <p className="max-w-[22rem] text-sm text-grey-1">
                Room links are case-sensitive — check you copied the whole thing, including the bit after the last dash.
            </p>
            <Link href="/" className="w-full max-w-xs">
                <Button variant="stroke" className="justify-center">
                    Start a new split
                </Button>
            </Link>
        </div>
    )
}
