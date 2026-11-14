'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ExistingRoomImportScreen } from '@/components/import/ExistingRoomImportScreen'
import { nativeRoomSlug } from '@/lib/native/links'

/** Import into an existing room: /room/import/?slug=<slug>. */
function RoomImport() {
    const router = useRouter()
    // Only a valid room slug reaches the screen; anything else (a hand-edited reload, a bad boot path) goes home.
    const slug = nativeRoomSlug(useSearchParams().get('slug'))

    useEffect(() => {
        if (!slug) router.replace('/app/')
    }, [slug, router])

    return slug ? <ExistingRoomImportScreen key={slug} slug={slug} /> : null
}

export default function NativeRoomImportPage() {
    return (
        <Suspense fallback={null}>
            <RoomImport />
        </Suspense>
    )
}
