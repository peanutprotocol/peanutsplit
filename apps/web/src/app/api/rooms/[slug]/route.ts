import { respond } from '@/server/http'
import { roomStateBySlug } from '@/server/roomState'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export const GET = (_request: Request, ctx: Ctx) => respond(async () => roomStateBySlug((await ctx.params).slug))
