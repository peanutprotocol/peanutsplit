import { readJson } from '@/server/http'
import { ATTACH_LIMIT, attachMemberships, type AttachResult } from '@/server/accounts'
import { enforceRateLimitOn } from '@/server/rateLimit'
import { respondAuthed } from '@/server/session'
import { attachSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

export const POST = (request: Request) =>
    respondAuthed(request, async (userId): Promise<{ results: AttachResult[] }> => {
        // Per account rather than per IP: this is a signed-in call, and a shared
        // office NAT should not be one allowance between everyone behind it.
        enforceRateLimitOn(userId, ATTACH_LIMIT, 'auth-attach')
        const { memberships } = attachSchema.parse(await readJson(request))
        return { results: await attachMemberships(userId, memberships) }
    })
