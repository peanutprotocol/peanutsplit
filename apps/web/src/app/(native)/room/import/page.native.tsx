'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ExistingRoomImportScreen } from '@/components/import/ExistingRoomImportScreen'

/** Import into an existing room: /room/import/?slug=<slug>. */
function RoomImport() {
    const router = useRouter()
    const slug = useSearchParams().get('slug')

    useEffect(() => {
        if (!slug) router.replace('/app/')
    }, [slug, router])

    return slug ? <ExistingRoomImportScreen slug={slug} /> : null
}

export default function NativeRoomImportPage() {
    return (
        <Suspense fallback={null}>
            <RoomImport />
        </Suspense>
    )
}
