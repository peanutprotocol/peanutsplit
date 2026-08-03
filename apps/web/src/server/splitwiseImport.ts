/**
 * A whole room in one write: roster, history and balances, from a validated import payload.
 *
 * This is a bulk migration wearing a route's clothes, so it follows migration rules rather than
 * request rules. No query runs inside a loop — the FX table is read once before anything starts,
 * the roster comes back from the room's own `create`, and the expenses and their shares each go in
 * with a single `createMany`. Four statements for five hundred expenses, not fifteen hundred.
 *
 * All of it is one `$transaction`. A room that half-imported would be the worst possible outcome:
 * the link works, the balances are wrong, and nobody can tell which rows are missing. Either the
 * whole file lands or nothing does.
 *
 * The share maths is NOT reimplemented here. Every expense goes through `buildExpense`, the same
 * function the expense drawer posts into, in EXACT mode — so FX, the rounding residue and the
 * "shares reconstruct the total" invariant all come from one place. EXACT ARITHMETIC ALWAYS, even
 * for a row the parser recognised as an even split, because the whole promise of an import is that
 * the numbers are the ones that were already there. The `splitMode` a row arrives with is a label
 * applied afterwards, and the loop below says why the two are separable.
 */
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { dealPersonaKeys } from '@/lib/avatars'
import { dealAvatarPaletteKeys } from '@/lib/avatar-palettes'
import { prisma } from '@/server/db'
import { buildExpense } from '@/server/expenses'
import { getRateTable } from '@/server/fx'
import { badRequest, conflict } from '@/server/http'
import { actorForMember, appendRoomAuditEvent } from '@/server/history'
import { loadRoom, type RoomWithRelations } from '@/server/roomState'
import { memberToken, roomSlug } from '@/server/slug'
import type { ImportRoomBody } from '@/server/validation'
import type { CreatedMember } from '@/server/rooms'

/** Same re-roll as `createRoom` — two rooms with the same name can collide on the random tail. */
const SLUG_ATTEMPTS = 5

const isSlugCollision = (err: unknown) =>
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    String((err.meta as { target?: string[] } | undefined)?.target ?? '').includes('slug')

/**
 * Five hundred expenses is more work than the 5s Prisma allows an interactive transaction by
 * default, and the failure mode is a rolled-back import that looked like it was working.
 */
const TRANSACTION_TIMEOUT_MS = 30_000

export async function importRoom(
    body: ImportRoomBody,
    request: Request = new Request('http://localhost')
): Promise<{ room: RoomWithRelations } & CreatedMember> {
    // Read phase: the one external lookup the whole import needs, before the transaction opens so
    // a slow rate feed can never hold a write lock.
    const rateTable = await getRateTable()
    const token = memberToken()

    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
        try {
            const slug = await writeRoom(body, rateTable, token, request)
            const room = await loadRoom(slug)
            const creator = room.members.find((m) => m.token === token)
            // Unreachable: the creator is validated to be one of the members before we get here.
            if (!creator) throw new Error('imported room has no creator member')
            return { room, memberId: creator.id, memberToken: token }
        } catch (err) {
            if (isSlugCollision(err)) continue
            throw err
        }
    }
    throw conflict('could not allocate a room link, please try again', 'SLUG_EXHAUSTED')
}

async function writeRoom(
    body: ImportRoomBody,
    rateTable: Awaited<ReturnType<typeof getRateTable>>,
    token: string,
    request: Request
): Promise<string> {
    const creatorKey = body.creatorName.toLowerCase()

    return prisma.$transaction(
        async (tx) => {
            const avatars = dealPersonaKeys(body.members.length)
            const avatarPalettes = dealAvatarPaletteKeys(body.members.length)
            const created = await tx.room.create({
                data: {
                    slug: roomSlug(body.roomName),
                    name: body.roomName,
                    emoji: body.emoji ?? null,
                    currency: body.currency,
                    // The whole roster in one statement. Only the creator gets the token back —
                    // everyone else's is issued now and handed out by the room link, exactly as if
                    // they had been added by hand.
                    members: {
                        createMany: {
                            data: body.members.map((name, index) => ({
                                name,
                                avatar: avatars[index],
                                avatarPalette: avatarPalettes[index],
                                // Case-insensitively, the same way the roster is checked for
                                // duplicates — so exactly one member can ever match.
                                token: name.toLowerCase() === creatorKey ? token : memberToken(),
                            })),
                        },
                    },
                },
                include: { members: { orderBy: { createdAt: 'asc' } } },
            })

            const byName = new Map(created.members.map((m) => [m.name.toLowerCase(), m.id]))
            const creatorId = byName.get(creatorKey)
            if (!creatorId) throw badRequest('the creator is not one of the members', 'VALIDATION_ERROR')

            // `buildExpense` wants the room's relations. A room created two statements ago has no
            // expenses and no settlements, so the empty arrays are the truth, not a stub.
            const room = { ...created, expenses: [], settlements: [] } as unknown as RoomWithRelations

            const expenseRows: Prisma.ExpenseCreateManyInput[] = []
            const shareRows: Prisma.ExpenseShareCreateManyInput[] = []
            let firstSharedBalanceExpenseId: string | null = null

            for (const imported of body.expenses) {
                const paidById = byName.get(imported.paidBy.toLowerCase())
                if (!paidById) throw badRequest(`${imported.paidBy} is not a member of this room`, 'NOT_A_MEMBER')

                const write = await buildExpense(
                    room,
                    {
                        description: imported.description,
                        amountMinor: imported.costMinor,
                        currency: imported.currencyCode,
                        paidById,
                        splitMode: 'EXACT',
                        exactShares: imported.shares.map((share) => ({
                            // Validated to exist: `importRoomSchema` refuses a share naming
                            // somebody who is not on the roster.
                            memberId: byName.get(share.member.toLowerCase()) as string,
                            amountMinor: share.amountMinor,
                        })),
                        date: `${imported.date}T00:00:00.000Z`,
                        category: imported.category ?? null,
                    },
                    undefined,
                    rateTable
                )

                /**
                 * Built through EXACT arithmetic whatever the row calls itself, and then labelled.
                 *
                 * The two are separable because `splitMode` is an EDITING fact, not an arithmetic
                 * one: the shares are always the truth. Recomputing an "equal" row through
                 * `equalShares` would put the rounding residue wherever Split puts it rather than
                 * where Splitwise put it, which moves a cent between two people on every row that
                 * has one — for a file of five hundred rows, a slow drift away from the balances
                 * the group already agreed on, in exchange for nothing. So the numbers are kept
                 * verbatim and only the label is honest, which is all the label is for: the drawer
                 * opens in equal mode, and the first real edit is what canonicalises the shares.
                 *
                 * `enteredAmountMinor` goes with the label. It means "as typed" and nobody typed
                 * these, so an EQUAL row carries nulls, exactly as the wire contract says it does.
                 */
                const equal = imported.splitMode === 'EQUAL'
                const shares = equal
                    ? write.shares.map((share) => ({ ...share, enteredAmountMinor: null }))
                    : write.shares

                // The id is minted here rather than read back, which is what lets the shares be
                // inserted in one statement instead of one round-trip per expense.
                const expenseId = randomUUID()
                if (
                    firstSharedBalanceExpenseId === null &&
                    shares.some((share) => share.memberId !== write.paidById && share.amountMinor > 0n)
                ) {
                    firstSharedBalanceExpenseId = expenseId
                }
                expenseRows.push({
                    id: expenseId,
                    roomId: created.id,
                    description: write.description,
                    amountMinor: write.amountMinor,
                    currency: write.currency,
                    baseAmountMinor: write.baseAmountMinor,
                    fxRate: write.fxRate,
                    paidById: write.paidById,
                    createdById: creatorId,
                    splitMode: equal ? 'EQUAL' : write.splitMode,
                    date: write.date,
                    category: write.category,
                })
                for (const share of shares) shareRows.push({ ...share, expenseId })
            }

            await tx.expense.createMany({ data: expenseRows })
            await tx.expenseShare.createMany({ data: shareRows })
            if (firstSharedBalanceExpenseId !== null) {
                await tx.room.update({
                    where: { id: created.id },
                    data: { firstSharedBalanceExpenseId },
                })
            }

            const creator = created.members.find(
                (member) => member.id === creatorId
            ) as (typeof created.members)[number]
            await appendRoomAuditEvent({
                tx,
                request,
                roomId: created.id,
                actor: actorForMember(creator),
                event: {
                    kind: 'room_imported',
                    subjectType: 'room',
                    subjectId: created.id,
                    after: {
                        room: {
                            id: created.id,
                            slug: created.slug,
                            name: created.name,
                            emoji: created.emoji,
                            currency: created.currency,
                        },
                        members: created.members.map((member) => ({
                            id: member.id,
                            name: member.name,
                            avatar: member.avatar,
                            avatarPalette: member.avatarPalette,
                        })),
                        expenses: expenseRows.map((expense) => ({
                            ...expense,
                            shares: shareRows.filter((share) => share.expenseId === expense.id),
                        })),
                    },
                    detail: { memberCount: created.members.length, expenseCount: expenseRows.length },
                },
            })

            return created.slug
        },
        { timeout: TRANSACTION_TIMEOUT_MS, maxWait: 10_000 }
    )
}
