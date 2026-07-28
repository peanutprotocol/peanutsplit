import { respond } from '@/server/http'
import { clearSession } from '@/server/session'

export const dynamic = 'force-dynamic'

/** Nothing server-side to revoke — the session is the cookie, so unsetting it is
 *  the whole of logging out. */
export const POST = async (): Promise<Response> => clearSession(await respond(async () => ({ ok: true })))
