/** Request-shape validation. Cross-field rules that need the room (membership,
 *  exact shares adding up) live in the domain modules, not here. */
import { z } from 'zod'
import { CURRENCY_CODES } from '@/server/money'

const currencyCode = z
    .string()
    .transform((s) => s.toUpperCase())
    .refine((s) => (CURRENCY_CODES as string[]).includes(s), { message: 'unsupported currency' })

/** Minor units as a decimal string — the only money representation on the wire. */
const minorAmount = z
    .union([z.string(), z.number().int()])
    .transform((v) => String(v))
    .refine((s) => /^\d+$/.test(s), { message: 'must be a whole number of minor units' })

const id = z.string().min(1).max(64)
const personName = z.string().trim().min(1, 'is required').max(80)

export const createRoomSchema = z.object({
    name: z.string().trim().min(1, 'is required').max(80),
    emoji: z.string().max(8).nullish(),
    currency: currencyCode,
    creatorName: personName,
})

export const createMemberSchema = z.object({ name: personName })

export const expenseSchema = z.object({
    description: z.string().trim().min(1, 'is required').max(255),
    amountMinor: minorAmount,
    currency: currencyCode,
    paidById: id,
    splitMode: z.enum(['EQUAL', 'EXACT']),
    participantIds: z.array(id).optional(),
    exactShares: z.array(z.object({ memberId: id, amountMinor: minorAmount })).optional(),
    date: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
    category: z.string().trim().max(40).nullish(),
})

export const settlementSchema = z.object({
    fromId: id,
    toId: id,
    amountMinor: minorAmount,
    method: z.string().trim().max(20).nullish(),
    note: z.string().trim().max(280).nullish(),
})

export const rateQuerySchema = z.object({ from: currencyCode, to: currencyCode })

/** Push-service URL. The host allowlist is a separate, testable gate — see
 *  `server/pushHosts.ts`; this only bounds the shape and the length. */
const pushEndpoint = z.string().trim().url().max(2048)
/** p256dh and auth are base64url out of the browser's own SubscriptionKeys. */
const pushKey = z
    .string()
    .trim()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9_\-=]+$/, 'must be base64')
const memberSecret = z.string().min(1).max(200)

export const pushSubscribeSchema = z.object({
    endpoint: pushEndpoint,
    keys: z.object({ p256dh: pushKey, auth: pushKey }),
    memberId: id,
    memberToken: memberSecret,
    userAgent: z.string().trim().max(512).nullish(),
})

export const pushUnsubscribeSchema = z.object({
    endpoint: pushEndpoint,
    memberId: id,
    memberToken: memberSecret,
})

/** What the service worker beacons back on a tap or a swipe-away. Every field is
 *  optional-ish because the worker is fire-and-forget and must never be the
 *  reason a notification misbehaves. */
export const pushFeedbackSchema = z.object({
    sendId: z.string().uuid(),
    template: z.string().max(40).nullish(),
    action: z.string().max(40).nullish(),
})

export type PushSubscribeBody = z.infer<typeof pushSubscribeSchema>

/** 254 is the RFC 5321 ceiling on an address; anything longer is a payload, not
 *  an email. Normalised to lower case before validation so `Ana@x.com` and
 *  `ana@x.com` cannot become two accounts on the same mailbox. */
const emailAddress = z
    .string()
    .max(254)
    .transform((s) => s.trim().toLowerCase())
    .refine((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), { message: 'must be an email address' })

export const requestLinkSchema = z.object({ email: emailAddress })

/** Fifty is far past any real device's history and bounds the batch the handler
 *  has to hold in memory. */
export const attachSchema = z.object({
    memberships: z
        .array(z.object({ slug: z.string().trim().min(1).max(120), memberId: id, token: z.string().min(1).max(200) }))
        .min(1)
        .max(50),
})

export type RequestLinkBody = z.infer<typeof requestLinkSchema>
export type AttachBody = z.infer<typeof attachSchema>

export type CreateRoomBody = z.infer<typeof createRoomSchema>
export type CreateMemberBody = z.infer<typeof createMemberSchema>
export type ExpenseBody = z.infer<typeof expenseSchema>
export type SettlementBody = z.infer<typeof settlementSchema>
// ── splitwise import ─────────────────────────────────────────────────────────

/**
 * The import posts a whole room at once, so this is the one schema where the request is big enough
 * to be worth bounding. The caps are the same numbers `lib/splitwise-csv.ts` enforces while
 * parsing — a preview that promises a room the POST would refuse is worse than an early no.
 *
 * The client parses the CSV and never uploads it, which means the server sees structured data it
 * did not derive and has to re-establish every invariant itself: members exist, the payer is one
 * of them, nobody is in a split twice, and the shares reconstruct the total. The last one is
 * checked here AND again inside `buildExpense`; the duplication is deliberate, because that is the
 * check that stands between a bad file and a room whose balances do not net to zero.
 */
export const IMPORT_MAX_MEMBERS = 20
export const IMPORT_MAX_EXPENSES = 500

/** Splitwise exports a calendar day, not an instant. */
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a YYYY-MM-DD date')

const importedExpenseSchema = z.object({
    date: isoDay,
    description: z.string().trim().min(1, 'is required').max(255),
    category: z.string().trim().max(40).nullish(),
    currencyCode: currencyCode,
    costMinor: minorAmount,
    paidBy: personName,
    shares: z
        .array(z.object({ member: personName, amountMinor: minorAmount }))
        .min(1)
        .max(IMPORT_MAX_MEMBERS),
})

export const importRoomSchema = z
    .object({
        roomName: z.string().trim().min(1, 'is required').max(80),
        emoji: z.string().max(8).nullish(),
        currency: currencyCode,
        creatorName: personName,
        members: z.array(personName).min(1).max(IMPORT_MAX_MEMBERS),
        expenses: z.array(importedExpenseSchema).min(1).max(IMPORT_MAX_EXPENSES),
    })
    .superRefine((body, ctx) => {
        const fail = (message: string, path: (string | number)[]) =>
            ctx.addIssue({ code: z.ZodIssueCode.custom, message, path })

        // Names are the join key between the roster and every expense, so they have to be unique
        // the same way Split's own roster is: case-insensitively.
        const roster = new Set(body.members.map((name) => name.toLowerCase()))
        if (roster.size !== body.members.length) fail('every member needs a distinct name', ['members'])
        if (!roster.has(body.creatorName.toLowerCase())) fail('must be one of the members', ['creatorName'])

        body.expenses.forEach((expense, i) => {
            if (!roster.has(expense.paidBy.toLowerCase())) fail('is not one of the members', ['expenses', i, 'paidBy'])

            const seen = new Set<string>()
            let total = 0n
            expense.shares.forEach((share, s) => {
                const key = share.member.toLowerCase()
                if (!roster.has(key)) fail('is not one of the members', ['expenses', i, 'shares', s, 'member'])
                if (seen.has(key)) fail('appears twice in this split', ['expenses', i, 'shares', s, 'member'])
                seen.add(key)
                total += BigInt(share.amountMinor)
            })

            const cost = BigInt(expense.costMinor)
            if (cost <= 0n) fail('must be greater than zero', ['expenses', i, 'costMinor'])
            if (total !== cost) fail('the shares must add up to the expense total', ['expenses', i, 'shares'])
        })
    })

export type ImportRoomBody = z.infer<typeof importRoomSchema>
