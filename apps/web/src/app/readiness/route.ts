import { prisma } from '@/server/db'

/** Readiness — the proxy health check. 200 only once the DB answers, so a cold
 *  container never receives traffic (that's where the deploy-time 502s come from). */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
    try {
        await prisma.$queryRaw`SELECT 1`
        return Response.json({ status: 'ready' }, { headers: { 'Cache-Control': 'no-store' } })
    } catch {
        return Response.json(
            { status: 'not-ready', reason: 'database unreachable' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } }
        )
    }
}
