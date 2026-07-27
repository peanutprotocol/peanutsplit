'use client'

import { useCallback, useEffect, useState } from 'react'
import { clearIdentity, readIdentity, writeIdentity, type MemberIdentity } from './identity'

export interface RoomIdentityState {
    identity: MemberIdentity | null
    /** False until the localStorage read has happened — never render the join
     *  gate before this flips, or every visit flashes it. */
    loaded: boolean
    claim: (identity: MemberIdentity) => void
    forget: () => void
}

/** Who this device is in `slug`, kept in sync with localStorage. */
export function useRoomIdentity(slug: string): RoomIdentityState {
    const [identity, setIdentity] = useState<MemberIdentity | null>(null)
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        setIdentity(readIdentity(slug))
        setLoaded(true)
    }, [slug])

    const claim = useCallback(
        (next: MemberIdentity) => {
            writeIdentity(slug, next)
            setIdentity(next)
        },
        [slug]
    )

    const forget = useCallback(() => {
        clearIdentity(slug)
        setIdentity(null)
    }, [slug])

    return { identity, loaded, claim, forget }
}
