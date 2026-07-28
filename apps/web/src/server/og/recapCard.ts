/**
 * The trip recap: what a room adds up to once it is over.
 *
 * Two shapes, on purpose. `RoomRecap` is the raw derivation — real names, minor
 * units, counts — and is what the HTML recap page renders, because HTML has no
 * glyph budget and a Cyrillic name is fine there. `RecapCardData` is the same
 * facts reduced to strings the two shipped OG fonts can actually draw, and is
 * the only thing the rasterizer ever sees. Mixing the two is how a card ends up
 * with a row of blank boxes where a name should be (see `fonts.ts`).
 *
 * Everything here is pure except `loadRecap`, so the interesting parts — the
 * date span, the top-payer tie-break, the settled fold — are testable without a
 * rasterizer or a database.
 */
import { prisma } from '@/server/db'
import { BODY_CHARS } from '@/server/og/fonts'
import { avatarsFor, safeAmount, sanitizeDisplayName, type OgAvatar } from '@/server/og/roomCard'

/** Shown instead of a member name we cannot draw. Better than blank boxes. */
export const MEMBER_FALLBACK = 'Someone'
/** A name is one line inside a sentence here, not a headline. */
export const MAX_MEMBER_CHARS = 22

/** The lean row shape `loadRecap` selects. Declared, not inferred, so the query
 *  and the derivation cannot drift apart silently. */
export interface RecapRoomRow {
    name: string
    emoji: string | null
    currency: string
    members: { id: string; name: string }[]
    expenses: {
        baseAmountMinor: bigint
        paidById: string
        date: Date
        shares: { memberId: string; amountMinor: bigint }[]
    }[]
    settlements: { fromId: string; toId: string; amountMinor: bigint }[]
}

/** The derivation, in the units the page wants. No font sanitizing applied. */
export interface RoomRecap {
    name: string
    emoji: string | null
    currency: string
    /** Minor units as a decimal string — a BigInt never crosses into a client prop. */
    totalMinor: string
    expenseCount: number
    memberCount: number
    /** Calendar days from the first expense to the last, inclusive. 0 when empty. */
    dayCount: number
    settlementCount: number
    /** Roster order, raw as stored. */
    memberNames: string[]
    /** Who fronted the most, raw. Null when there is nothing to be top of. */
    topPayerName: string | null
    settled: boolean
}

/** The same facts, drawable. */
export interface RecapCardData {
    name: string
    /** Raw emoji as stored — the renderer resolves it to an image, not a glyph. */
    emoji: string | null
    /** The hero number: "€2340.00". */
    total: string
    /** "9 days · 14 expenses · 6 people" */
    stat: string
    /** "María fronted the most", or null when the line would be silly. */
    topPayer: string | null
    avatars: OgAvatar[]
    overflow: number
    settled: boolean
}

/**
 * Reduce a member name to something the BODY font can draw, by the same rule
 * `sanitizeDisplayName` applies to room names: keep the stripped name only if it
 * still reads as the same name (at least one alphanumeric, at least 70% of the
 * meaningful characters kept), otherwise fall back rather than ship something
 * half-eaten.
 *
 * A generalised copy rather than a shared helper because `roomCard.ts` has
 * another owner this week — the two want the same rule over different charsets
 * and different fallbacks. Dedupe once the OG module has one owner.
 */
const DECORATIVE = new RegExp('[\\p{Extended_Pictographic}\\u200D\\uFE00-\\uFE0F]', 'u')

const countMeaningful = (value: string) => [...value].filter((ch) => !/\s/.test(ch) && !DECORATIVE.test(ch)).length

export function sanitizeMemberName(raw: string): string {
    const kept = [...raw]
        .filter((ch) => BODY_CHARS.has(ch))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()

    if (!/[A-Za-z0-9]/.test(kept)) return MEMBER_FALLBACK

    const meaningful = countMeaningful(raw)
    if (meaningful > 0 && countMeaningful(kept) / meaningful < 0.7) return MEMBER_FALLBACK

    const chars = [...kept]
    if (chars.length <= MAX_MEMBER_CHARS) return kept
    // `…` is not in either cmap — three dots always are.
    return `${chars.slice(0, MAX_MEMBER_CHARS).join('').trimEnd()}...`
}

const DAY_MS = 86_400_000

/**
 * Days elapsed, counted in UTC calendar days and inclusive of both ends: one
 * expense is one day, not zero.
 *
 * UTC rather than a reader's zone because the recap has to say the same thing to
 * everyone in the group — a card rendered for a crawler in Frankfurt and a page
 * read in São Paulo must not disagree about whether the trip was 9 days or 10.
 */
export function daySpan(dates: readonly Date[]): number {
    if (dates.length === 0) return 0
    let min = Infinity
    let max = -Infinity
    for (const date of dates) {
        const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS)
        if (day < min) min = day
        if (day > max) max = day
    }
    return max - min + 1
}

/**
 * Who fronted the most money, by summed room-currency total.
 *
 * Ties break on the name, in code-unit order — NOT `localeCompare`, whose
 * collation depends on the ICU build the container happens to ship. The recap is
 * cached and re-rendered on other boxes; "deterministic" has to mean across
 * processes, not just within one.
 *
 * A payer who is no longer on the roster is skipped, the same way `balancesOf`
 * ignores rows for members it has no entry for.
 */
export function topPayerName(
    members: readonly { id: string; name: string }[],
    expenses: readonly { paidById: string; baseAmountMinor: bigint }[]
): string | null {
    if (expenses.length === 0) return null

    const fronted = new Map<string, bigint>()
    for (const expense of expenses) {
        fronted.set(expense.paidById, (fronted.get(expense.paidById) ?? 0n) + expense.baseAmountMinor)
    }

    let best: { name: string; paid: bigint } | null = null
    for (const member of members) {
        const paid = fronted.get(member.id)
        if (paid === undefined || paid <= 0n) continue
        if (!best || paid > best.paid || (paid === best.paid && member.name < best.name)) {
            best = { name: member.name, paid }
        }
    }
    return best?.name ?? null
}

/** The columns a balance is folded from — structural on purpose, so a full
 *  `RoomWithRelations` is assignable to it and the drift test can feed both
 *  folds the exact same fixture. */
export interface BalanceInput {
    members: readonly { id: string }[]
    expenses: readonly {
        paidById: string
        baseAmountMinor: bigint
        shares: readonly { memberId: string; amountMinor: bigint }[]
    }[]
    settlements: readonly { fromId: string; toId: string; amountMinor: bigint }[]
}

/**
 * Net position per member.
 *
 * MIRRORS `balancesOf` in `@/server/roomState`, which is the source of truth for
 * what a balance IS — this copy exists only because that one takes a full
 * `RoomWithRelations` and the recap deliberately selects four columns. The fold
 * is identical and `recapCard.test.ts` asserts the two agree on shared fixtures,
 * so a change to the semantics there fails here rather than drifting.
 */
export function netBalances(room: BalanceInput): Map<string, bigint> {
    const net = new Map<string, bigint>(room.members.map((m) => [m.id, 0n]))
    const bump = (id: string, delta: bigint) => {
        const current = net.get(id)
        if (current !== undefined) net.set(id, current + delta)
    }

    for (const expense of room.expenses) {
        bump(expense.paidById, expense.baseAmountMinor)
        for (const share of expense.shares) bump(share.memberId, -share.amountMinor)
    }
    for (const settlement of room.settlements) {
        bump(settlement.fromId, settlement.amountMinor)
        bump(settlement.toId, -settlement.amountMinor)
    }
    return net
}

/** A room is settled when everybody is square AND there was something to square:
 *  an empty room is not "settled", it is empty, and the card must not claim a
 *  result that never happened. */
export const isSettled = (room: BalanceInput): boolean =>
    room.expenses.length > 0 && [...netBalances(room).values()].every((net) => net === 0n)

/** Shape the raw room row into the recap. Exported for tests; no I/O. */
export function toRoomRecap(room: RecapRoomRow): RoomRecap {
    const total = room.expenses.reduce((sum, e) => sum + e.baseAmountMinor, 0n)
    return {
        name: room.name,
        emoji: room.emoji,
        currency: room.currency,
        totalMinor: total.toString(),
        expenseCount: room.expenses.length,
        memberCount: room.members.length,
        dayCount: daySpan(room.expenses.map((e) => e.date)),
        settlementCount: room.settlements.length,
        memberNames: room.members.map((m) => m.name),
        topPayerName: topPayerName(room.members, room.expenses),
        settled: isSettled(room),
    }
}

/** "9 days · 14 expenses · 6 people". The day count drops out of an empty room
 *  rather than printing "0 days" next to "0 expenses". */
export function recapStatLine(recap: Pick<RoomRecap, 'dayCount' | 'expenseCount' | 'memberCount'>): string {
    const parts: string[] = []
    if (recap.dayCount > 0) parts.push(`${recap.dayCount} ${recap.dayCount === 1 ? 'day' : 'days'}`)
    parts.push(`${recap.expenseCount} ${recap.expenseCount === 1 ? 'expense' : 'expenses'}`)
    parts.push(`${recap.memberCount} ${recap.memberCount === 1 ? 'person' : 'people'}`)
    return parts.join(' · ')
}

/**
 * The recap, drawable.
 *
 * The top-payer line is suppressed below two members: "Ana fronted the most" in
 * a room where Ana is the only person is a true sentence that reads as a bug.
 */
export function toRecapCard(recap: RoomRecap): RecapCardData {
    const { avatars, overflow } = avatarsFor(recap.memberNames)
    const topPayer =
        recap.topPayerName !== null && recap.memberCount > 1
            ? `${sanitizeMemberName(recap.topPayerName)} fronted the most`
            : null
    return {
        name: sanitizeDisplayName(recap.name),
        emoji: recap.emoji,
        total: safeAmount(BigInt(recap.totalMinor), recap.currency),
        stat: recapStatLine(recap),
        topPayer,
        avatars,
        overflow,
        settled: recap.settled,
    }
}

/**
 * One query, nothing loaded the recap does not use. Returns null for an unknown
 * slug — the image route renders the generic brand card and the page renders the
 * not-found screen, because a dead recap link is what a stale link looks like,
 * and a 500 is what a whole group chat would cache.
 */
export async function loadRecap(slug: string): Promise<RoomRecap | null> {
    const room = await prisma.room.findUnique({
        where: { slug },
        select: {
            name: true,
            emoji: true,
            currency: true,
            members: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true } },
            expenses: {
                where: { deletedAt: null },
                select: {
                    baseAmountMinor: true,
                    paidById: true,
                    date: true,
                    shares: { select: { memberId: true, amountMinor: true } },
                },
            },
            settlements: { where: { deletedAt: null }, select: { fromId: true, toId: true, amountMinor: true } },
        },
    })
    return room ? toRoomRecap(room) : null
}
