'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { CreateRoomForm } from '@/components/room/CreateRoomForm'
import { readPrefill } from '@/lib/room-prefill'

/** The template link's prefill rides the query string, as on web. No ad tags in the app. */
function NewRoom() {
    const searchParams = useSearchParams()
    return <CreateRoomForm prefill={readPrefill(Object.fromEntries(searchParams.entries()))} />
}

export default function NativeNewRoomPage() {
    return (
        <main data-frame="card" className="split-app-frame mx-auto min-h-dvh w-full max-w-xl bg-background">
            <Suspense fallback={null}>
                <NewRoom />
            </Suspense>
        </main>
    )
}
