import { respond } from '@/server/http'
import { accountSummary, type AccountSummary } from '@/server/accounts'
import { readSession } from '@/server/session'

export const dynamic = 'force-dynamic'

/** Signed out is `null`, not an error — the UI asks this on every load and being
 *  accountless is the normal answer. */
export const GET = (request: Request) =>
    respond(async (): Promise<AccountSummary | null> => {
        const session = await readSession(request)
        return session ? await accountSummary(session.userId) : null
    })
