/**
 * In-process pub/sub for "this room changed" pokes.
 *
 * A subscriber is one open SSE stream; `publish(roomId)` is called by the write
 * routes once the row is committed. Nothing about the change travels with the
 * poke — see the route for why.
 *
 * HONEST SCOPE: THIS IS PER-CONTAINER. The subscriber table lives in this
 * process's memory. Two replicas would each hold half the open streams and each
 * see half the writes, so a phone connected to replica A would never hear about
 * an expense written on replica B. Today's deploy is deliberately single-replica
 * (one Dokploy service, one container), and the client keeps polling as a
 * fallback precisely so that the day that stops being true the room is a few
 * seconds stale rather than silently wrong. If a second replica ever ships, the
 * fix is a shared bus — Postgres LISTEN/NOTIFY is already in the stack — not a
 * bigger cap here.
 */

/** Per room. A room is a group chat; fifty open streams is already generous, and
 *  the cap is what stops one shared link from pinning a container's sockets. */
export const MAX_SUBSCRIBERS_PER_ROOM = 50

/** Process-wide. Every stream costs a socket and a heartbeat timer; past this
 *  the honest answer is "poll", not a slow death by file descriptors. */
export const MAX_SUBSCRIBERS_TOTAL = 2_000

/** Called with no arguments — a poke carries no payload by design. */
export type Poke = () => void

const rooms = new Map<string, Set<Poke>>()
let total = 0

/**
 * Register a stream for `roomId`. Returns the unsubscribe function, or `null`
 * when either cap is already reached — the caller answers 204 and the client
 * stays on polling.
 *
 * Unsubscribing twice is a no-op: the abort handler and the stream's `cancel`
 * both fire for a closed tab, and double-decrementing the total would eventually
 * report negative capacity and hand out streams forever.
 */
export function subscribe(roomId: string, onPoke: Poke): (() => void) | null {
    if (total >= MAX_SUBSCRIBERS_TOTAL) return null
    const existing = rooms.get(roomId)
    if (existing && existing.size >= MAX_SUBSCRIBERS_PER_ROOM) return null

    const set = existing ?? new Set<Poke>()
    if (!existing) rooms.set(roomId, set)
    set.add(onPoke)
    total += 1

    let released = false
    return () => {
        if (released) return
        released = true
        const current = rooms.get(roomId)
        if (!current?.delete(onPoke)) return
        total -= 1
        // Drop the empty set rather than keeping a key per room ever visited —
        // this map would otherwise be an unbounded leak on a long-lived process.
        if (current.size === 0) rooms.delete(roomId)
    }
}

/**
 * Poke every stream open on this room. Called AFTER the write commits, so the
 * refetch it triggers can only ever see the new state.
 *
 * Iterates a copy and swallows per-subscriber failures: a stream whose client
 * vanished throws on enqueue, and one dead socket must not stop the fan-out to
 * everyone else in the room.
 */
export function publish(roomId: string): void {
    const set = rooms.get(roomId)
    if (!set) return
    for (const onPoke of [...set]) {
        try {
            onPoke()
        } catch (err) {
            console.warn('[split] sse poke failed', err instanceof Error ? err.message : 'unknown')
        }
    }
}

/** Open streams — for a room, or process-wide when called with no argument. */
export const subscriberCount = (roomId?: string): number =>
    roomId === undefined ? total : (rooms.get(roomId)?.size ?? 0)

/** Test seam — the module is process-global state and a suite needs it empty. */
export function resetEvents(): void {
    rooms.clear()
    total = 0
}
