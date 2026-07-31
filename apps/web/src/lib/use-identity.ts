'use client'

import { useCallback, useEffect, useState } from 'react'
import { clearIdentity, readIdentity, writeIdentity, type MemberIdentity } from './identity'
import { dropRoomSubscription } from './use-push'

export interface RoomIdentityState {
    identity: MemberIdentity | null
    /** False until the localStorage read has happened — never render the join
     *  gate before this flips, or every visit flashes it. */
    loaded: boolean
    claim: (identity: MemberIdentity) => void
    forget: () => void
}

/**
 * "Not me" — hand the phone over, or pick a different name.
 *
 * The notification channel has to go before the identity does: dropping it needs
 * the member token, and once that is out of localStorage there is no way left to
 * turn the room off. The device would keep buzzing for a room it no longer claims
 * to be in.
 *
 * Started, not awaited. A person handing over a phone on a dead network must
 * still stop being this member, so a failed drop is swallowed — the row it leaves
 * behind is prunable (the endpoint 410s once the browser rotates it) and
 * re-claiming the room re-subscribes over the top of it.
 *
 * Outside the hook, and exported, because it is the only thing that makes the
 * confirm sheet's "and stops getting this room's notifications" true — a promise
 * to the person holding the phone deserves a test, and a test cannot render a
 * hook in this suite.
 */
export function forgetIdentity(slug: string, previous: MemberIdentity | null): void {
    if (previous?.token) {
        void dropRoomSubscription(slug, previous.memberId, previous.token).catch(() => {})
    }
    clearIdentity(slug)
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
        forgetIdentity(slug, identity)
        setIdentity(null)
    }, [slug, identity])

    return { identity, loaded, claim, forget }
}
