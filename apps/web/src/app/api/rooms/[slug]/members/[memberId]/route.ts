/**
 * Your own face, and nobody else's.
 *
 * This is the second write in the product that demands a token-PROVEN member —
 * reactions are the first, and the argument is the same one. A room's ledger is
 * deliberately weak about identity: anyone holding the link can record that Ana
 * paid, because inside a room that is visible and one tap to fix. An avatar is
 * not a ledger row, it is what Ana looks like to everybody else, and letting a
 * link-holder repaint it would be a way to put a face on somebody.
 *
 * The member id is in the PATH and the token is in the BODY, which is what makes
 * "only your own" structural rather than a check somebody can forget: the row
 * updated is the one named in the path, and `assertProvenMember` refuses unless
 * the token in hand is that row's. There is no shape of this request that
 * changes a different member.
 *
 * PATCH rather than PUT: the body carries one field of a member that has several.
 */
import { prisma } from '@/server/db'
import { publish } from '@/server/events'
import { readJson, respond } from '@/server/http'
import { WRITE_LIMIT, enforceRateLimit } from '@/server/rateLimit'
import { assertProvenMember, loadRoom, loadRoomById, toRoomState } from '@/server/roomState'
import { assertWritable } from '@/server/rooms'
import { memberAvatarSchema } from '@/server/validation'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; memberId: string }> }

export const PATCH = (request: Request, ctx: Ctx) =>
    respond(async () => {
        // The `reaction` bucket, not `write`: picking an avatar is browsing a
        // grid, and a few taps of taste must not spend the allowance the room
        // needs for its expenses.
        enforceRateLimit(request, WRITE_LIMIT, 'reaction')
        const { slug, memberId } = await ctx.params
        const body = memberAvatarSchema.parse(await readJson(request))

        const room = await loadRoom(slug)
        assertWritable(room)
        assertProvenMember(room, memberId, body.memberToken)

        await prisma.member.update({ where: { id: memberId }, data: { avatar: body.avatar } })
        const state = toRoomState(await loadRoomById(room.id))
        // After the commit, like every other write — a face that only travelled
        // on the poll would arrive up to 45s late on a phone holding an open
        // stream, slower than it managed before the stream existed.
        publish(room.id)
        return state
    })
