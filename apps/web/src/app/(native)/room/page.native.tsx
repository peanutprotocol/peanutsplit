'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LoadingRoom from '../../(product-shell)/r/[slug]/loading'
import { RoomScreen } from '@/components/room/RoomScreen'

/** A static export has no dynamic segment, so the slug rides the query: /room/?slug=<slug>. */
function Room() {
    const router = useRouter()
    const slug = useSearchParams().get('slug')

    useEffect(() => {
        if (!slug) router.replace('/app/')
    }, [slug, router])

    return slug ? <RoomScreen slug={slug} /> : null
}

export default function NativeRoomPage() {
    return (
        <Suspense fallback={<LoadingRoom />}>
            <Room />
        </Suspense>
    )
}
