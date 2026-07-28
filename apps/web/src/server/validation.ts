/** Request-shape validation. Cross-field rules that need the room (membership,
 *  exact shares adding up) live in the domain modules, not here. */
import { z } from 'zod'
import { CURRENCY_CODES } from '@/server/money'
import { isReactionEmoji } from '@/lib/reactions'
import { isThemeKey } from '@/lib/themes'

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

// ── receipt scan ─────────────────────────────────────────────────────────────
//
// Two schemas, and it is worth saying why the second one lives beside the first.
// `receiptParseSchema` bounds what a *browser* sends us. `receiptModelSchema`
// bounds what a *language model* sends us, and that is the same category of
// input: unauthenticated text of unknown provenance that ends up deciding how
// money is divided. It gets the same `minorAmount` primitive every other amount
// on this surface gets, in the same file, so nobody can wire the model's
// arithmetic straight into a split without walking past this.

/** The image formats the model accepts and a phone can actually produce. HEIC is
 *  deliberately absent — the client converts it via canvas before upload, so the
 *  server never needs a decoder for Apple's container. */
export const RECEIPT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export const receiptParseSchema = z.object({
    /** Raw base64, no `data:` prefix. The route checks the byte ceiling before it
     *  ever gets here — an oversized upload is a 413, not a schema rejection. */
    imageBase64: z.string().min(16),
    mimeType: z.enum(RECEIPT_IMAGE_TYPES),
})

/**
 * Twelve digits is a trillion minor units — past any bill anyone has ever split,
 * and short enough that a hallucinated run of digits cannot turn one line item
 * into a number that dwarfs every real one on the receipt.
 */
export const receiptAmountMinor = minorAmount.refine((s) => s.length <= 12, { message: 'implausibly large amount' })

/** One line item, as the model claims it. Parsed per item so a single bad row is
 *  dropped rather than costing the user the whole scan. */
export const receiptItemSchema = z.object({
    // Truncated, not rejected: a model that returned the whole address block as
    // a label still read a real line item, and dropping the row would drop money
    // off the bill to punish a formatting mistake.
    label: z
        .string()
        .trim()
        .min(1)
        .transform((s) => s.slice(0, 80)),
    amountMinor: receiptAmountMinor,
    /** Printed quantity, when there is one. Display only — the amount is the line
     *  total, so nothing multiplies by this. Nonsense degrades to "not printed"
     *  rather than costing the item its place. */
    quantity: z.coerce.number().int().min(1).max(999).nullish().catch(null),
})

/**
 * The envelope, kept deliberately loose: `items` and `total` come in as unknown
 * and are narrowed one at a time in `server/receipt.ts`. A strict array schema
 * would fail the whole payload on one malformed row, which is exactly the moment
 * a user has already spent their photo and their patience.
 *
 * Every field `.catch`es to null for the same reason: the only thing that should
 * be able to fail this parse is "the model did not return an object at all". A
 * hallucinated `date` must not cost someone their itemised bill.
 */
export const receiptModelSchema = z.object({
    items: z.array(z.unknown()).nullish().catch(null),
    total: z.unknown(),
    currency: z.string().max(16).nullish().catch(null),
    merchant: z.string().max(200).nullish().catch(null),
    date: z.string().max(40).nullish().catch(null),
})

export type ReceiptParseBody = z.infer<typeof receiptParseSchema>
// ── delight wave ─────────────────────────────────────────────────────────────

/**
 * A theme is a key into `lib/themes.ts`, never a colour. Anything not in the
 * catalog is rejected outright rather than stored and ignored — a row holding a
 * key nothing can render is a bug that only shows up months later, on an unfurl.
 * `null` is the default palette and is always legal.
 */
export const roomThemeSchema = z.object({
    // `nullable`, not `nullish`: an absent key would silently mean "back to the
    // default palette", and a PATCH that resets a room because a field got
    // dropped somewhere in the client is the kind of bug nobody reproduces.
    theme: z
        .string()
        .max(40)
        .nullable()
        .refine((value) => value === null || isThemeKey(value), { message: 'unknown theme' }),
})

/**
 * `memberToken` sits in the body rather than the header for the same reason it
 * does on push subscriptions: here the token is PROOF, not attribution, and the
 * shape of the request should say which of the two it is.
 */
export const reactionSchema = z.object({
    emoji: z.string().refine(isReactionEmoji, { message: 'not a reaction we support' }),
    memberId: id,
    memberToken: memberSecret,
})

export type RoomThemeBody = z.infer<typeof roomThemeSchema>
export type ReactionBody = z.infer<typeof reactionSchema>
