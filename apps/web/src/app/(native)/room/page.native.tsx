'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LoadingRoom from '../../(product-shell)/r/[slug]/loading'
import { RoomScreen } from '@/components/room/RoomScreen'
import { nativeRoomSlug } from '@/lib/native/links'

/** A static export has no dynamic segment, so the slug rides the query: /room/?slug=<slug>. */
function Room() {
    const router = useRouter()
    // Only a valid room slug reaches the screen; anything else (a hand-edited reload, a bad boot path) goes home.
    const slug = nativeRoomSlug(useSearchParams().get('slug'))

    useEffect(() => {
        if (!slug) router.replace('/app/')
    }, [slug, router])

    return slug ? <RoomScreen key={slug} slug={slug} /> : null
}

export default function NativeRoomPage() {
    return (
        <Suspense fallback={<LoadingRoom />}>
            <Room />
        </Suspense>
    )
}
