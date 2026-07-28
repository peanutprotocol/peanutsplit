import { readJson, respond } from '@/server/http'
import { REQUEST_LINK_LIMIT, requestMagicLink } from '@/server/accounts'
import { enforceRateLimit } from '@/server/rateLimit'
import { requestLinkSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

export const POST = (request: Request) =>
    respond(async (): Promise<{ ok: true }> => {
        enforceRateLimit(request, REQUEST_LINK_LIMIT, 'auth-request-link')
        const { email } = requestLinkSchema.parse(await readJson(request))
        await requestMagicLink(email)
        // Always the same answer. "We sent you a link" for an address we have
        // never seen and for one we have is the difference between a login form
        // and a tool for finding out who has an account.
        return { ok: true }
    })
