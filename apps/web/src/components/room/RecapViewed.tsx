'use client'

import { useEffect, useRef } from 'react'
import { roomProps, track } from '@/lib/analytics'

/**
 * Renders nothing. The recap screen is a server component, and one page view is
 * still worth counting — it is the denominator for `recap_shared`.
 *
 * The room is a hash and nothing else travels: no total, no names, no day count.
 * An amount in a property bag is the same leak as an amount in a URL.
 */
export function RecapViewed({ slug, settled }: { slug: string; settled: boolean }) {
    const fired = useRef(false)

    useEffect(() => {
        if (fired.current) return
        fired.current = true
        track('recap_viewed', roomProps(slug, { settled }))
    }, [slug, settled])

    return null
}
