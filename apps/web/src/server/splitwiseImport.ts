/**
 * Parsed history in one atomic bulk write, either creating a room or appending
 * to one that already exists.
 *
 * This is a bulk migration wearing a route's clothes, so it follows migration rules rather than
 * request rules. No expense query runs inside the build loop: the FX table is read once before
 * anything starts, and all expenses and shares land through one `createMany` each. Creating the
 * bounded set of newly mapped people may do roster queries, but five hundred expense rows never
 * become fifteen hundred round trips.
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
import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { dealPersonaKeys } from '@/lib/avatars'
import { dealAvatarPaletteKeys } from '@/lib/avatar-palettes'
import { prisma } from '@/server/db'
import { buildExpense, expenseNeedsRateTable } from '@/server/expenses'
import { getRateTable, rateFrom } from '@/server/fx'
import { badRequest, conflict } from '@/server/http'
import { actorForMember, actorFromToken, appendRoomAuditEvent, lockRoomWrite } from '@/server/history'
import { canPriceCode, isCatalogCode } from '@/server/money'
import { loadRoom, type RoomWithRelations } from '@/server/roomState'
import { addMemberInLockedTransaction } from '@/server/rooms'
import { memberToken, roomSlug } from '@/server/slug'
import type { ImportIntoRoomBody, ImportRoomBody } from '@/server/validation'
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

const sourceNameKey = (name: string): string => name.toLowerCase()
const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)

/**
 * A semantic identity for one parsed source export.
 *
 * Target-room choices are intentionally absent: once this source history has
 * committed to a room, changing its mapping and posting it again must be a
 * replay, not a second set of balances attributed to different people. Array
 * order is absent too. A CSV re-serialized with columns or rows in another
 * order is still the same roster and expense multiset; duplicate identical
 * rows remain duplicate strings in the sorted array, so multiplicity survives.
 */
export function importSourceFingerprint(body: ImportIntoRoomBody | ImportRoomBody): string {
    const canonicalExpenses = body.expenses
        .map((expense) =>
            JSON.stringify({
                date: expense.date,
                description: expense.description,
                category: expense.category?.trim() || null,
                currencyCode: expense.currencyCode,
                costMinor: BigInt(expense.costMinor).toString(),
                paidBy: sourceNameKey(expense.paidBy),
                splitMode: expense.splitMode ?? 'EXACT',
                shares: expense.shares
                    .map((share) => ({
                        member: sourceNameKey(share.member),
                        amountMinor: BigInt(share.amountMinor).toString(),
                    }))
                    .sort((left, right) =>
                        left.member === right.member
                            ? compareText(left.amountMinor, right.amountMinor)
                            : compareText(left.member, right.member)
                    ),
            })
        )
        .sort()
    const canonical = JSON.stringify({
        members: body.members
            .map((member) => sourceNameKey(typeof member === 'string' ? member : member.sourceName))
            .sort(),
        expenses: canonicalExpenses,
    })
    return createHash('sha256').update(canonical).digest('hex')
}

export interface ImportIntoRoomOutcome {
    room: RoomWithRelations
    batchId: string
    importedAt: Date
    addedExpenses: number
    addedMembers: number
    alreadyImported: boolean
}

interface ImportedExpenseRows {
    expenses: Array<Prisma.ExpenseCreateManyInput & { id: string }>
    shares: Prisma.ExpenseShareCreateManyInput[]
    sharesByExpenseId: ReadonlyMap<string, Prisma.ExpenseShareCreateManyInput[]>
    firstSharedBalanceExpenseId: string | null
}

interface ImportRowProvenance {
    batchId: string
    /** Distinct millisecond ordering timestamps. Source calendar days remain
     * in `date`; this sequence says precisely when each imported row landed. */
    timestampBase: Date
}

/** Build all money rows without writing them. Both import destinations pass
 * through the ordinary expense builder so FX and exact-share reconciliation
 * keep one definition. */
async function buildImportedExpenseRows(
    room: RoomWithRelations,
    importedExpenses: ImportRoomBody['expenses'],
    bySourceName: ReadonlyMap<string, string>,
    createdById: string | null,
    rateTable: Awaited<ReturnType<typeof getRateTable>> | undefined,
    provenance?: ImportRowProvenance
): Promise<ImportedExpenseRows> {
    const expenseRows: Array<Prisma.ExpenseCreateManyInput & { id: string }> = []
    const shareRows: Prisma.ExpenseShareCreateManyInput[] = []
    const sharesByExpenseId = new Map<string, Prisma.ExpenseShareCreateManyInput[]>()
    let firstSharedBalanceExpenseId: string | null = null

    for (const [rowIndex, imported] of importedExpenses.entries()) {
        const paidById = bySourceName.get(sourceNameKey(imported.paidBy))
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
                    // Both schemas prove every share source name is on their
                    // source roster. Append imports additionally prove every
                    // roster entry resolves to one distinct room member.
                    memberId: bySourceName.get(sourceNameKey(share.member)) as string,
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
         * where the source put it. `enteredAmountMinor` goes with that label: nobody typed
         * an imported equal row, so its entered amounts are null.
         */
        const equal = imported.splitMode === 'EQUAL'
        const shares = equal ? write.shares.map((share) => ({ ...share, enteredAmountMinor: null })) : write.shares

        const expenseId = randomUUID()
        if (
            firstSharedBalanceExpenseId === null &&
            shares.some((share) => share.memberId !== write.paidById && share.amountMinor > 0n)
        ) {
            firstSharedBalanceExpenseId = expenseId
        }
        expenseRows.push({
            id: expenseId,
            roomId: room.id,
            description: write.description,
            amountMinor: write.amountMinor,
            currency: write.currency,
            baseAmountMinor: write.baseAmountMinor,
            fxRate: write.fxRate,
            paidById: write.paidById,
            createdById,
            splitMode: equal ? 'EQUAL' : write.splitMode,
            date: write.date,
            category: write.category,
            ...(provenance
                ? {
                      importBatchId: provenance.batchId,
                      importRowIndex: rowIndex,
                      createdAt: new Date(provenance.timestampBase.getTime() + rowIndex),
                  }
                : {}),
        })
        const expenseShares = shares.map((share) => ({ ...share, expenseId }))
        shareRows.push(...expenseShares)
        sharesByExpenseId.set(expenseId, expenseShares)
    }

    return { expenses: expenseRows, shares: shareRows, sharesByExpenseId, firstSharedBalanceExpenseId }
}

export async function importRoom(
    body: ImportRoomBody,
    request: Request = new Request('http://localhost')
): Promise<{ room: RoomWithRelations } & CreatedMember> {
    // Read phase: the one external lookup the whole import needs, before the transaction opens so
    // a slow rate feed can never hold a write lock.
    const rateTable = await getRateTable()
    const token = memberToken()
    const fingerprint = importSourceFingerprint(body)

    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
        try {
            const slug = await writeRoom(body, rateTable, fingerprint, token, request)
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

/**
 * Append a parsed source export to an existing room.
 *
 * Exact semantic replays are successful no-ops. Different fingerprints append
 * in full, even when a newer export overlaps an older one; there is no honest
 * stable source-expense id in the supported formats with which to do partial
 * overlap detection. The batch fingerprint only protects retries and identical
 * concurrent deliveries.
 */
export async function importIntoRoom(
    initialRoom: RoomWithRelations,
    body: ImportIntoRoomBody,
    request: Request = new Request('http://localhost'),
    actorToken: string | null = null
): Promise<ImportIntoRoomOutcome> {
    // Splitwise and Split Pro exports contain catalog currencies. A room that
    // settles in an invented unit has no automatic conversion target, and the
    // import contract intentionally has no manual-rate field. Refuse before the
    // FX lookup and transaction so this unsupported pairing cannot stage people
    // or touch the ledger. Ordinary manual-rate expense writes remain separate.
    if (!isCatalogCode(initialRoom.currency)) {
        throw badRequest(
            `imports cannot be converted into custom room currency ${initialRoom.currency}`,
            'IMPORT_TARGET_CURRENCY_UNSUPPORTED'
        )
    }
    const unsupportedCurrencies = [...new Set(body.expenses.map((expense) => expense.currencyCode))].filter(
        (sourceCurrency) => !canPriceCode(sourceCurrency, initialRoom.currency)
    )
    if (unsupportedCurrencies.length > 0) {
        throw badRequest(
            `import currencies ${unsupportedCurrencies.join(', ')} cannot be converted into ${initialRoom.currency}`,
            'IMPORT_CURRENCY_CONVERSION_UNSUPPORTED'
        )
    }
    const fingerprint = importSourceFingerprint(body)

    // Identity rows (including KPW → KPW and other catalog currencies without
    // a feed rate) need no table. Keeping this decision before the optimistic
    // replay lookup means an accepted same-currency import never wakes FX work.
    const needsRateTable = body.expenses.some((expense) =>
        expenseNeedsRateTable(initialRoom.currency, expense.currencyCode)
    )

    // A replay must not depend on today's FX table. This optimistic read only
    // avoids that lookup; the authoritative replay decision still happens
    // under the room lock below, so a concurrent first delivery is safe.
    const knownBatch = await prisma.importBatch.findUnique({
        where: { roomId_fingerprint: { roomId: initialRoom.id, fingerprint } },
        select: { id: true },
    })
    const rateTable = knownBatch || !needsRateTable ? undefined : await getRateTable()
    if (rateTable) {
        const unavailableNow = [...new Set(body.expenses.map((expense) => expense.currencyCode))].filter(
            (sourceCurrency) => rateFrom(rateTable, sourceCurrency, initialRoom.currency) === null
        )
        if (unavailableNow.length > 0) {
            throw badRequest(
                `import currencies ${unavailableNow.join(', ')} cannot be converted into ${initialRoom.currency}`,
                'IMPORT_CURRENCY_CONVERSION_UNSUPPORTED'
            )
        }
    }

    return prisma.$transaction(
        async (tx) => {
            await lockRoomWrite(tx, initialRoom.id)
            let lockedRoom = await loadRoom(initialRoom.slug, tx)

            // This comes before resolving ids or creating requested new names.
            // In particular, replaying `{ newMemberName: "Bea" }` after the
            // original import created Bea is still a clean no-op rather than a
            // duplicate-name conflict.
            const existing = await tx.importBatch.findUnique({
                where: { roomId_fingerprint: { roomId: lockedRoom.id, fingerprint } },
            })
            if (existing) {
                return {
                    room: lockedRoom,
                    batchId: existing.id,
                    importedAt: existing.importedAt,
                    addedExpenses: existing.expenseCount,
                    addedMembers: existing.addedMemberCount,
                    alreadyImported: true,
                }
            }
            // An ImportBatch has no delete path, so a positive optimistic read
            // cannot disappear while this request is waiting for the lock.
            if (knownBatch) throw new Error('known import batch disappeared')

            const actor = actorFromToken(lockedRoom.members, actorToken)
            const bySourceName = new Map<string, string>()
            const usedTargetIds = new Set<string>()

            // Prove all existing targets before adding anything. The schema has
            // already made source names and explicit ids one-to-one, while this
            // locked read proves the ids belong to this room.
            for (const mapping of body.members) {
                if (!('memberId' in mapping)) continue
                const target = lockedRoom.members.find((member) => member.id === mapping.memberId)
                if (!target) {
                    throw badRequest(`${mapping.sourceName} is not mapped to a member of this room`, 'NOT_A_MEMBER')
                }
                if (usedTargetIds.has(target.id)) {
                    throw badRequest('each source member needs a distinct room member', 'VALIDATION_ERROR')
                }
                usedTargetIds.add(target.id)
                bySourceName.set(sourceNameKey(mapping.sourceName), target.id)
            }

            // Reject every name collision against the authoritative roster
            // before issuing member tokens. The eventual helper repeats the
            // check by design; both happen under this same advisory lock.
            const roomNames = new Set(lockedRoom.members.map((member) => sourceNameKey(member.name)))
            for (const mapping of body.members) {
                if (!('newMemberName' in mapping)) continue
                if (roomNames.has(sourceNameKey(mapping.newMemberName))) {
                    throw conflict(`${mapping.newMemberName} is already in this room`, 'DUPLICATE_MEMBER_NAME')
                }
                roomNames.add(sourceNameKey(mapping.newMemberName))
            }

            const addedMemberIds: string[] = []
            for (const mapping of body.members) {
                if (!('newMemberName' in mapping)) continue
                const added = await addMemberInLockedTransaction(
                    tx,
                    lockedRoom.id,
                    mapping.newMemberName,
                    undefined,
                    true
                )
                if (usedTargetIds.has(added.memberId)) throw new Error('import member mapping reused a target')
                usedTargetIds.add(added.memberId)
                addedMemberIds.push(added.memberId)
                bySourceName.set(sourceNameKey(mapping.sourceName), added.memberId)
            }

            if (addedMemberIds.length > 0) lockedRoom = await loadRoom(initialRoom.slug, tx)
            if (bySourceName.size !== body.members.length) throw new Error('import member mapping did not resolve')

            // `importedAt` is provenance truth: the actual server clock after
            // acquiring the room lock. Expense ordering has a separate
            // monotonic base so a rapid previous 500-row batch cannot push this
            // reported instant into the future.
            const importedAt = new Date()
            const latestExpense = await tx.expense.findFirst({
                where: { roomId: lockedRoom.id },
                select: { createdAt: true },
                orderBy: { createdAt: 'desc' },
            })
            const timestampBase = new Date(
                Math.max(importedAt.getTime(), (latestExpense?.createdAt.getTime() ?? importedAt.getTime() - 1) + 1)
            )
            const batchId = randomUUID()
            const rows = await buildImportedExpenseRows(
                lockedRoom,
                body.expenses,
                bySourceName,
                actor.memberId,
                rateTable,
                { batchId, timestampBase }
            )

            await tx.importBatch.create({
                data: {
                    id: batchId,
                    roomId: lockedRoom.id,
                    fingerprint,
                    importedAt,
                    expenseCount: rows.expenses.length,
                    addedMemberCount: addedMemberIds.length,
                },
            })
            await tx.expense.createMany({ data: rows.expenses })
            await tx.expenseShare.createMany({ data: rows.shares })
            if (lockedRoom.firstSharedBalanceExpenseId === null && rows.firstSharedBalanceExpenseId !== null) {
                await tx.room.update({
                    where: { id: lockedRoom.id },
                    data: { firstSharedBalanceExpenseId: rows.firstSharedBalanceExpenseId },
                })
            }

            const addedMembers = lockedRoom.members
                .filter((member) => addedMemberIds.includes(member.id))
                .map((member) => ({
                    id: member.id,
                    name: member.name,
                    avatar: member.avatar,
                    avatarPalette: member.avatarPalette,
                    provisional: member.provisional,
                }))
            const firstEntryAt = rows.expenses[0]?.createdAt
            const lastEntryAt = rows.expenses.at(-1)?.createdAt
            await appendRoomAuditEvent({
                tx,
                request,
                roomId: lockedRoom.id,
                actor,
                event: {
                    kind: 'room_import_appended',
                    subjectType: 'room',
                    subjectId: lockedRoom.id,
                    after: {
                        batch: {
                            id: batchId,
                            importedAt,
                            expenseCount: rows.expenses.length,
                            addedMemberCount: addedMembers.length,
                        },
                        members: addedMembers,
                    },
                    detail: {
                        batchId,
                        importedAt,
                        expenseCount: rows.expenses.length,
                        memberCount: addedMembers.length,
                        firstEntryCreatedAt: firstEntryAt,
                        lastEntryCreatedAt: lastEntryAt,
                    },
                },
            })

            return {
                room: await loadRoom(initialRoom.slug, tx),
                batchId,
                importedAt,
                addedExpenses: rows.expenses.length,
                addedMembers: addedMembers.length,
                alreadyImported: false,
            }
        },
        { timeout: TRANSACTION_TIMEOUT_MS, maxWait: 10_000 }
    )
}

async function writeRoom(
    body: ImportRoomBody,
    rateTable: Awaited<ReturnType<typeof getRateTable>>,
    fingerprint: string,
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

            // Seed the same provenance ledger the nested append route reads. A
            // room created from this source can therefore recognise an exact
            // later delivery as a replay rather than duplicating its balances.
            const batchId = randomUUID()
            const importedAt = new Date()
            const rows = await buildImportedExpenseRows(room, body.expenses, byName, creatorId, rateTable, {
                batchId,
                timestampBase: importedAt,
            })
            await tx.importBatch.create({
                data: {
                    id: batchId,
                    roomId: created.id,
                    fingerprint,
                    importedAt,
                    expenseCount: rows.expenses.length,
                    addedMemberCount: created.members.length,
                },
            })
            await tx.expense.createMany({ data: rows.expenses })
            await tx.expenseShare.createMany({ data: rows.shares })
            if (rows.firstSharedBalanceExpenseId !== null) {
                await tx.room.update({
                    where: { id: created.id },
                    data: { firstSharedBalanceExpenseId: rows.firstSharedBalanceExpenseId },
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
                        batch: {
                            id: batchId,
                            importedAt,
                            expenseCount: rows.expenses.length,
                            addedMemberCount: created.members.length,
                        },
                        members: created.members.map((member) => ({
                            id: member.id,
                            name: member.name,
                            avatar: member.avatar,
                            avatarPalette: member.avatarPalette,
                        })),
                        expenses: rows.expenses.map((expense) => ({
                            ...expense,
                            shares: rows.sharesByExpenseId.get(expense.id) ?? [],
                        })),
                    },
                    detail: {
                        batchId,
                        importedAt,
                        memberCount: created.members.length,
                        expenseCount: rows.expenses.length,
                    },
                },
            })

            return created.slug
        },
        { timeout: TRANSACTION_TIMEOUT_MS, maxWait: 10_000 }
    )
}
