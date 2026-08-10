import { ApiError, errorEnvelope, json, PRIVATE_JSON_CACHE_CONTROL } from '@/server/http'
import {
    acknowledgeInstallHandoff,
    appendSetCookieHeaders,
    assertInstallHandoffSameOrigin,
    clearedInstallHandoffCookieHeaders,
    installHandoffTokenFrom,
    readEmptyInstallHandoffCommand,
    redeemInstallHandoff,
} from '@/server/installHandoff'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'

export const dynamic = 'force-dynamic'

const terminalUnavailable = (error: unknown): boolean =>
    error instanceof ApiError && error.code === 'INSTALL_HANDOFF_UNAVAILABLE'

/** Idempotent peek. The Home Screen app ACKs only after its localStorage writes
 * round-trip; until then a process kill may safely ask for the same payload. */
export async function POST(request: Request): Promise<Response> {
    try {
        assertInstallHandoffSameOrigin(request)
        enforceRateLimit(request, WRITE_LIMIT, 'install-handoff-redeem')
        await readEmptyInstallHandoffCommand(request)
        return json(await redeemInstallHandoff(installHandoffTokenFrom(request)))
    } catch (error) {
        const response = errorEnvelope(error)
        return terminalUnavailable(error)
            ? appendSetCookieHeaders(response, clearedInstallHandoffCookieHeaders())
            : response
    }
}

/** Idempotent consume. An absent/already-consumed token is already the desired
 * state. A transient database failure leaves both cookies intact for retry. */
export async function DELETE(request: Request): Promise<Response> {
    try {
        assertInstallHandoffSameOrigin(request)
        enforceRateLimit(request, WRITE_LIMIT, 'install-handoff-ack')
        await acknowledgeInstallHandoff(installHandoffTokenFrom(request))
        const response = new Response(null, { status: 204, headers: { 'Cache-Control': PRIVATE_JSON_CACHE_CONTROL } })
        return appendSetCookieHeaders(response, clearedInstallHandoffCookieHeaders())
    } catch (error) {
        return errorEnvelope(error)
    }
}
