'use client'

/**
 * The client half of the room stream: an EventSource that turns every poke into
 * "refetch the room".
 *
 * It knows nothing about react-query — the caller hands in what to do on a poke
 * (`useRoomState` passes a refetch) and gets back whether the socket is actually
 * open, which is what decides how hard the fallback polls. Keeping the two apart
 * is also what keeps `queries.ts → realtime.ts` a one-way import.
 */

import { useEffect, useRef, useState } from 'react'

/** First retry. Doubling from here, so a server that comes straight back is
 *  noticed within a second. */
export const BASE_BACKOFF_MS = 1_000

/** Ceiling. Past half a minute the poll (8s while disconnected) is carrying the
 *  room anyway, and a tighter loop only costs the container sockets. */
export const MAX_BACKOFF_MS = 30_000

/**
 * Full jitter. Without it, a container restart brings every phone in every room
 * back at the same millisecond, forever, in lockstep — the classic thundering
 * herd, and the reason this reconnects by hand instead of letting EventSource do
 * its built-in fixed-interval retry.
 */
export const backoffDelay = (attempt: number, random: () => number = Math.random): number => {
    const ceiling = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1))
    return Math.round(ceiling * (0.5 + random() * 0.5))
}

export interface RoomEvents {
    /**
     * True only while the stream is genuinely OPEN. Never treat it as "the data
     * is fresh" — see the polling comment in `useRoomState`.
     */
    connected: boolean
}

/**
 * Subscribe to `slug`'s event stream for as long as the component is mounted.
 *
 * `onPoke` is read through a ref, so a caller that rebuilds the callback every
 * render does not tear down and reopen the socket.
 */
export function useRoomEvents(slug: string, onPoke: () => void): RoomEvents {
    const [connected, setConnected] = useState(false)
    const pokeRef = useRef(onPoke)
    pokeRef.current = onPoke

    useEffect(() => {
        // SSR, and the handful of environments with no EventSource: the room
        // still works, it just polls. Nothing to fall back *to* is not an error.
        if (typeof window === 'undefined' || typeof EventSource === 'undefined') return

        let source: EventSource | null = null
        let retry: ReturnType<typeof setTimeout> | null = null
        let attempt = 0
        let stopped = false

        const clearRetry = () => {
            if (retry !== null) clearTimeout(retry)
            retry = null
        }

        const connect = () => {
            if (stopped || source) return
            const stream = new EventSource(`/api/rooms/${encodeURIComponent(slug)}/events`)
            source = stream

            stream.onopen = () => {
                attempt = 0
                setConnected(true)
                // Catch up on the gap. A poke is fire-and-forget and is never
                // replayed, so every write that landed while this stream was
                // down — a container restart, a tunnel, the very first connect —
                // produced nothing this device will ever hear about. Connecting
                // then STRETCHES the poll to 45s, so without this a reconnect
                // makes the room slower to heal than staying disconnected would
                // have been. Same move as the visibility handler below.
                pokeRef.current()
            }

            stream.onmessage = () => {
                // Payload ignored by contract — the poke means "ask the server".
                pokeRef.current()
            }

            stream.onerror = () => {
                // Fires for a dropped connection AND for a stream the server
                // closed deliberately (the 204 at capacity). They are
                // indistinguishable from here, which is fine: both mean "poll",
                // and the backoff makes the capped case a cheap slow retry
                // rather than a hammer.
                setConnected(false)
                stream.close()
                if (source === stream) source = null
                if (stopped) return
                attempt += 1
                clearRetry()
                retry = setTimeout(connect, backoffDelay(attempt))
            }
        }

        /**
         * Waking from sleep is its own failure mode. A phone that has been in a
         * pocket for an hour comes back holding a socket that is dead at the OS
         * level but still reads as OPEN, and no error event ever arrives — so a
         * room can sit there looking connected and never update again. On every
         * return to the foreground: refetch once regardless, and reopen the
         * stream unless it is provably still OPEN.
         */
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return
            pokeRef.current()
            if (source && source.readyState === EventSource.OPEN) return
            source?.close()
            source = null
            attempt = 0
            clearRetry()
            connect()
        }

        document.addEventListener('visibilitychange', onVisible)
        connect()

        return () => {
            stopped = true
            document.removeEventListener('visibilitychange', onVisible)
            clearRetry()
            source?.close()
            source = null
            setConnected(false)
        }
    }, [slug])

    return { connected }
}

/**
 * DEFERRED, deliberately: presence ("Bea is looking at this room").
 *
 * The transport is now here for free, but presence needs an identity model this
 * product does not have — a room member is a name on a device, impersonation is
 * tolerated by design, and "who is here" would be the first surface where that
 * shrug becomes visible and wrong. It also needs its own privacy answer, since
 * the slug is the only credential. Not a TODO; a product decision that has not
 * been made.
 */
