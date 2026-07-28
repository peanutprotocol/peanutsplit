import { prisma } from '@/server/db'
import { subscribe } from '@/server/events'
import { errorResponse } from '@/server/http'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

/**
 * The poke. No payload, ever.
 *
 * Pushing the new RoomState down this stream would create a second source of
 * truth for money: two paths that build a balance sheet, one of them fed by a
 * transport with no status code, no retry semantics and no way to tell a
 * dropped frame from a quiet room. The client gets told "something moved" and
 * refetches the one authoritative GET, which is the same request it would have
 * polled for — the socket only changes *when* it asks, never *what it learns*.
 */
const POKE = 'data: bump\n\n'

/** Comment frames. Proxies (and mobile carriers) kill an idle stream well inside
 *  a minute; 25s sits under the usual 30s idle timeout with room to spare. */
const HEARTBEAT = ': keepalive\n\n'
const HEARTBEAT_MS = 25_000

export const GET = async (request: Request, ctx: Ctx): Promise<Response> => {
    const { slug } = await ctx.params
    // Deliberately not `loadRoom` — that pulls every expense, share and
    // settlement to answer a question that is only "does this room exist".
    const room = await prisma.room.findUnique({ where: { slug }, select: { id: true } })
    if (!room) return errorResponse('NOT_FOUND', 'room not found', 404)

    // The sink is late-bound because capacity has to be checked BEFORE a stream
    // exists: subscribing from inside `start()` would mean the response is
    // already committed by the time we learn the room is full.
    let push: ((chunk: string) => void) | null = null
    const unsubscribe = subscribe(room.id, () => push?.(POKE))
    if (!unsubscribe) {
        // 204 is load-bearing, not a generic "no": per the EventSource spec it
        // tells the browser to close the connection and NOT reconnect. A capped
        // client goes quiet and keeps polling, which is exactly the fallback.
        return new Response(null, { status: 204 })
    }

    const encoder = new TextEncoder()
    let heartbeat: ReturnType<typeof setInterval> | null = null

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false
            const close = () => {
                if (closed) return
                closed = true
                unsubscribe()
                if (heartbeat) clearInterval(heartbeat)
                push = null
                try {
                    controller.close()
                } catch {
                    // Already closed by the runtime when the client hung up.
                }
            }

            push = (chunk: string) => {
                try {
                    controller.enqueue(encoder.encode(chunk))
                } catch {
                    // The socket is gone; the abort signal usually beats us here,
                    // but a failed enqueue is proof enough on its own.
                    close()
                }
            }

            // Flush something immediately: a proxy that buffers until the first
            // byte would otherwise hold the response open with the browser still
            // in CONNECTING, and the client would sit on the 8s poll believing
            // the socket never opened.
            push(': open\n\n')
            heartbeat = setInterval(() => push?.(HEARTBEAT), HEARTBEAT_MS)

            // Closing the tab, navigating away, or the platform reaping an idle
            // connection all arrive here — this is the only cleanup that fires
            // for the common case.
            request.signal.addEventListener('abort', close)
        },
        cancel() {
            unsubscribe()
            if (heartbeat) clearInterval(heartbeat)
            push = null
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            // `no-transform` matters as much as `no-cache`: a compressing proxy
            // will happily buffer a stream it is trying to gzip.
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            // nginx-family proxies buffer proxied responses by default, which
            // turns a live stream into a batch delivered at close.
            'X-Accel-Buffering': 'no',
        },
    })
}
