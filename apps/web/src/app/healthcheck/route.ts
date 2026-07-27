/** Liveness. No DB, no SSR, answers in microseconds — a health path that renders
 *  or queries gets the instance killed under load. */
export const dynamic = 'force-static'

export const GET = () =>
    new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } })
