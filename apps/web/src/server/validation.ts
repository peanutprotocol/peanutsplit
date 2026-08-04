/** Request-shape validation. Cross-field rules that need the room (membership,
 *  exact shares adding up) live in the domain modules, not here. */
import { z } from 'zod'
import { isValidCode, MAX_SIGNED_MINOR, normaliseCode, parseManualFxRate } from '@/server/money'
import { isAvatarKey } from '@/lib/avatars'
import { isAvatarPaletteKey } from '@/lib/avatar-palettes'
import { isReactionEmoji } from '@/lib/reactions'
import { isRoomDrawing } from '@/lib/room-drawing'
import { isThemeKey } from '@/lib/themes'
import {
    MAX_CATEGORY_CHARS,
    MAX_DESCRIPTION_CHARS,
    MAX_EXPENSES,
    MAX_MEMBERS,
    MAX_NAME_CHARS,
} from '@/lib/splitwise-csv'

/**
 * A currency code — one of the 162 real ones, or a ticker somebody invented.
 *
 * The shape is the whole gate: three or four ASCII letters after NFKC, trim and uppercase. That
 * is deliberately not "is it in the catalog", because a made-up ticker is a supported room
 * currency now. What stops a made-up code from being netted against a real one is the room-aware
 * expense domain, not this shape: a foreign invented code needs an explicit manual rate, while
 * catalog pairs continue through `requireRate`.
 *
 * `.max(16)` bounds the input before normalising it. NFKC on unbounded text is work an
 * unauthenticated request should not be able to ask for.
 */
const currencyCode = z
    .string()
    .max(16)
    .transform(normaliseCode)
    .refine(isValidCode, { message: 'must be a three or four letter currency code' })

/** Minor units as a decimal string — the only money representation on the wire. */
const minorAmount = z
    .string()
    .regex(/^\d+$/, 'must be a whole number of minor units')
    .max(19, 'amount is too large')
    .refine(
        (s) => {
            try {
                return BigInt(s) <= MAX_SIGNED_MINOR
            } catch {
                return false
            }
        },
        { message: 'amount is too large' }
    )

/** A relative split weight on the wire. It is stored as BIGINT and therefore
 *  follows the same signed-column ceiling as money, but zero is never a
 *  participant: callers omit somebody instead of assigning no weight. */
const splitWeight = minorAmount.refine(
    (s) => {
        try {
            return BigInt(s) > 0n
        } catch {
            return false
        }
    },
    { message: 'must be greater than zero' }
)

const id = z.string().min(1).max(64)
const clientKey = z
    .string()
    .min(16)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/, 'must be an opaque request key')
const personName = z.string().trim().min(1, 'is required').max(MAX_NAME_CHARS)

/**
 * The room's emblem. Presets and legacy emoji remain short strings. A custom
 * drawing is the bounded, strictly parsed `drawing:v1:` stroke format; arbitrary
 * long strings never become room data merely because the database column can
 * hold them.
 *
 * One definition for all three ways a room gets an emblem — create, import, and the settings
 * PATCH — so a room cannot be renamed into holding a value it could never have been created
 * with. Deliberately NOT an enum of the drawing names: rooms made before the drawings still
 * hold an emoji character, and `lib/room-emblem.ts` is where that reading happens.
 */
const roomEmblem = z
    .string()
    .refine((value) => (value.startsWith('drawing:') ? isRoomDrawing(value) : value.length <= 24), {
        message: 'must be a room drawing or a short emblem',
    })

export const createRoomSchema = z.object({
    name: z.string().trim().min(1, 'is required').max(80),
    emoji: roomEmblem.nullish(),
    currency: currencyCode,
    creatorName: personName,
})

export const createMemberSchema = z.object({
    name: personName,
    /** A roster addition is made on somebody else's behalf and must not return
     *  their identity token. Missing stays `join` for clients deployed before
     *  the two response contracts became explicit. */
    intent: z.enum(['join', 'add']).default('join'),
})

const expenseName = z.string().trim().max(MAX_DESCRIPTION_CHARS)
const splitMode = z.enum(['EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES'])
const manualFxRate = z
    .string()
    .max(64)
    .transform((value) => value.trim())
    .refine((value) => parseManualFxRate(value) !== null, {
        message: 'must be a positive decimal rate with at most 12 whole and 12 fractional digits',
    })

/** Everything an expense request carries except its name, which is the one field
 *  a create and an edit have to treat differently — see the two schemas below. */
const expenseFields = {
    clientKey: clientKey.optional(),
    amountMinor: minorAmount,
    currency: currencyCode,
    /** Room-currency major units per one custom-currency major unit. Whether the
     *  pair permits or requires it needs the room and is enforced by buildExpense. */
    manualFxRate: manualFxRate.optional(),
    paidById: id.optional(),
    /** A payer typed inside a new expense stays a draft until the expense
     *  transaction commits. It is mutually exclusive with an existing id. */
    newPaidByName: personName.optional(),
    splitMode,
    participantIds: z.array(id).optional(),
    exactShares: z.array(z.object({ memberId: id, amountMinor: minorAmount })).optional(),
    weightedShares: z.array(z.object({ memberId: id, weight: splitWeight })).optional(),
    date: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
    category: z.string().trim().max(MAX_CATEGORY_CHARS).nullish(),
}

const onePayer = (body: { paidById?: string; newPaidByName?: string }, ctx: z.RefinementCtx): void => {
    if (!!body.paidById === !!body.newPaidByName) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['paidById'],
            message: 'provide either paidById or newPaidByName',
        })
    }
}

const splitPayloadMatchesMode = (
    body: {
        splitMode: 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARES'
        participantIds?: string[]
        exactShares?: unknown[]
        weightedShares?: unknown[]
    },
    ctx: z.RefinementCtx
): void => {
    const reject = (field: 'participantIds' | 'exactShares' | 'weightedShares') => {
        if (body[field] !== undefined)
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [field],
                message: `does not belong to a ${body.splitMode} split`,
            })
    }

    if (body.splitMode === 'EQUAL') {
        reject('exactShares')
        reject('weightedShares')
    } else if (body.splitMode === 'EXACT') {
        reject('participantIds')
        reject('weightedShares')
    } else {
        reject('participantIds')
        reject('exactShares')
    }
}

export const expenseSchema = z
    .object({
        ...expenseFields,
        /** Optional. A row with no name is labelled by its day on every surface
         *  that shows it, so an absent or blank one stores as the empty string
         *  rather than being refused. */
        description: expenseName.default(''),
    })
    .superRefine(onePayer)
    .superRefine(splitPayloadMatchesMode)

/**
 * The same request, for a PATCH.
 *
 * `description` is `.optional()` here and NOT defaulted, because the two verbs
 * mean opposite things by an absent key. On a create, "no name given" is the
 * empty string. On an edit, the PATCH handler replaces every column it is given,
 * so a default turned "I did not send that field" into "blank the name" — a
 * client that sent only a new amount silently lost the row's name. Absent now
 * means untouched, and `''` still means clear it.
 */
export const expenseUpdateSchema = z
    .object({
        ...expenseFields,
        description: expenseName.optional(),
        /** Optimistic compatibility marker. The PATCH route compares this with
         *  the stored mode before it replaces weighted shares. Optional here so
         *  pre-feature clients can continue editing EQUAL and EXACT rows. */
        expectedSplitMode: splitMode.optional(),
    })
    .superRefine(onePayer)
    .superRefine(splitPayloadMatchesMode)

export const catchUpExpenseSchema = z.object({
    operation: z.literal('CATCH_UP_EQUAL_PARTICIPANT'),
    action: z.enum(['add', 'remove']),
    memberId: id,
    expectedDescription: z.string().max(MAX_DESCRIPTION_CHARS),
    expectedAmountMinor: minorAmount,
    expectedBaseAmountMinor: minorAmount,
    expectedCurrency: currencyCode,
    expectedFxRate: z.string().min(1).max(64),
    expectedPaidById: id,
    expectedDate: z.string().datetime({ offset: true }).or(z.string().datetime()),
    expectedCategory: z.string().max(MAX_CATEGORY_CHARS).nullable(),
    expectedParticipantIds: z
        .array(id)
        .min(1)
        .refine((ids) => new Set(ids).size === ids.length, 'must not contain duplicate members'),
})

/** The existing expense write surface also accepts the narrow, atomic catch-up
 * command. This keeps catch-up inside the frozen money API instead of adding a
 * second endpoint that can change balances. */
export const expensePatchSchema = z.union([catchUpExpenseSchema, expenseUpdateSchema])

const receiptUrl = z
    .string()
    .trim()
    .max(2048)
    .refine((value) => {
        try {
            const protocol = new URL(value).protocol
            return protocol === 'http:' || protocol === 'https:'
        } catch {
            return false
        }
    }, 'must be an http or https URL')

export const settlementSchema = z.object({
    clientKey: clientKey.optional(),
    fromId: id,
    toId: id,
    amountMinor: minorAmount,
    method: z.string().trim().max(20).nullish(),
    note: z.string().trim().max(280).nullish(),
    receiptUrl: receiptUrl.nullish(),
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

/** Asking whether THIS room is on for this endpoint. Same three fields as the
 *  unsubscribe, and deliberately its own schema: the question is a read, and it
 *  must stay free to gain a field without widening what a delete accepts. */
export const pushStatusSchema = z.object({
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

export type CreateRoomBody = z.infer<typeof createRoomSchema>
export type CreateMemberBody = z.infer<typeof createMemberSchema>
export type ExpenseBody = z.infer<typeof expenseSchema>
export type ExpenseUpdateBody = z.infer<typeof expenseUpdateSchema>
export type CatchUpExpenseBody = z.infer<typeof catchUpExpenseSchema>
export type SettlementBody = z.infer<typeof settlementSchema>

// ── what a model says ────────────────────────────────────────────────────────
//
// Two kinds of schema live below, and it is worth saying why they share a file.
// `receiptParseSchema` and `nlParseSchema` bound what a *browser* sends us.
// `receiptModelSchema` and `nlModelSchema` bound what a *language model* sends
// us, and that is the same category of input: unauthenticated text of unknown
// provenance that ends up deciding how money is divided. It gets the same
// `minorAmount` primitive every other amount on this surface gets, in the same
// file, so nobody can wire a model's arithmetic straight into a split without
// walking past this.

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
 * into a number that dwarfs every real one on the receipt. Shared by both
 * model-fed features: a hallucinated amount is a hallucinated amount whether it
 * came off a photo or out of a sentence.
 */
export const modelAmountMinor = z
    // Models routinely emit a JSON number despite being asked for a string.
    // Twelve digits is safely below Number's exact-integer ceiling, so accept
    // that shape only at this model seam and normalize it immediately.
    .union([minorAmount, z.number().int().min(0).max(999_999_999_999).transform(String)])
    .refine((s) => s.length <= 12, { message: 'implausibly large amount' })

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
    amountMinor: modelAmountMinor,
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

// ── quick add (free text → one expense) ──────────────────────────────────────

/** One line, typed or pasted. The ceiling is enforced in the route rather than
 *  here so an over-long paste gets its own sentence instead of the generic
 *  "check the fields" — see `MAX_NL_TEXT_CHARS`. */
export const nlParseSchema = z.object({ text: z.string().trim().min(1, 'is required') })

/**
 * The envelope, kept deliberately loose for the same reason `receiptModelSchema`
 * is: the only thing that should be able to fail this parse is "the model did
 * not return an object at all". Every field is narrowed one at a time in
 * `server/nlExpense.ts`, and a hallucinated `date` must not cost someone the
 * amount that was read correctly.
 *
 * `participantNames` comes in as unknown elements rather than `string[]`: one
 * non-string in the array would otherwise fail the whole payload, when the right
 * answer is to drop that element and keep the people the model got right.
 */
export const nlModelSchema = z.object({
    description: z.string().max(400).nullish().catch(null),
    amountMinor: z.unknown(),
    currency: z.string().max(16).nullish().catch(null),
    date: z.string().max(40).nullish().catch(null),
    payerName: z.string().max(200).nullish().catch(null),
    participantNames: z.array(z.unknown()).nullish().catch(null),
})

export type NlParseBody = z.infer<typeof nlParseSchema>
// ── delight wave ─────────────────────────────────────────────────────────────

/**
 * Link-holder-editable room presentation. The slug is intentionally absent:
 * the link is the room's credential and permanent address, while `name` is only
 * the display label people see after opening it.
 *
 * A theme is a key into `lib/themes.ts`, never a colour. Anything not in the
 * catalog is rejected outright rather than stored and ignored — a row holding a
 * key nothing can render is a bug that only shows up months later, on an unfurl.
 * `null` is the default palette and is always legal.
 *
 * The emblem is the SAME `roomEmblem` the create and import paths use, on
 * purpose: an edit must not be able to write a value a new room could not hold.
 * `null` means "follow the room name" — the state a room is born in.
 */
export const roomSettingsSchema = z
    .object({
        name: z.string().trim().min(1, 'is required').max(80).optional(),
        // `nullable`, not `nullish`: null deliberately resets the palette, while
        // an absent key leaves it untouched during a name-only PATCH.
        theme: z
            .string()
            .max(40)
            .nullable()
            .refine((value) => value === null || isThemeKey(value), { message: 'unknown theme' })
            .optional(),
        // `nullable`, not `nullish`, for the reason the theme gives above.
        emoji: roomEmblem.nullable().optional(),
    })
    .strict()
    .refine((value) => value.name !== undefined || value.theme !== undefined || value.emoji !== undefined, {
        message: 'at least one room setting is required',
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

/**
 * A member's alter ego: a key from `lib/avatars.ts`. Null remains accepted from
 * older clients and is converted to a fresh random key by the route. Anyone in
 * the link-trusted room can cast anyone else, just as they can add an expense
 * on somebody's behalf.
 *
 * Anything outside the catalog is rejected rather than stored. This value
 * renders beside a person's name on everybody else's phone, so a free-text
 * field would turn lighthearted casting into an unmoderated writing surface.
 */
export const memberAvatarSchema = z.object({
    // `nullable`, not `nullish`, for the reason `roomSettingsSchema` gives: a
    // dropped field must not silently reset somebody's avatar.
    avatar: z
        .string()
        .max(40)
        .nullable()
        .refine((value) => value === null || isAvatarKey(value), { message: 'unknown avatar' }),
    // Optional keeps a rolling deploy compatible with clients that only know
    // the character key. Explicit null is not a reset; `avatar: null` is the
    // legacy reroll request and the route chooses a fresh pair for it.
    avatarPalette: z.string().max(40).refine(isAvatarPaletteKey, { message: 'unknown avatar palette' }).optional(),
})

export type RoomSettingsBody = z.infer<typeof roomSettingsSchema>
export type ReactionBody = z.infer<typeof reactionSchema>
export type MemberAvatarBody = z.infer<typeof memberAvatarSchema>
// ── splitwise import ─────────────────────────────────────────────────────────

/**
 * The import posts a whole room at once, so this is the one schema where the request is big enough
 * to be worth bounding. The caps are IMPORTED from `lib/splitwise-csv.ts` rather than restated:
 * a preview that promises a room the POST would refuse is worse than an early no, and two numbers
 * that have to agree should be one number.
 *
 * The client parses the CSV and never uploads it, which means the server sees structured data it
 * did not derive and has to re-establish every invariant itself: members exist, the payer is one
 * of them, nobody is in a split twice, and the shares reconstruct the total. The last one is
 * checked here AND again inside `buildExpense`; the duplication is deliberate, because that is the
 * check that stands between a bad file and a room whose balances do not net to zero.
 *
 * Every one of those failures leaves as a generic `VALIDATION_ERROR`, deliberately: the client
 * already showed a per-row preview of exactly what it was about to post, so a row number in the
 * error would be a second, worse copy of a screen the user just read and approved. The zod path
 * (`expenses.12.shares`) is in the English message for whoever is reading a log.
 */
/** Splitwise exports a calendar day, not an instant. */
const isoDay = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a YYYY-MM-DD date')
    .refine((value) => {
        const parsed = new Date(`${value}T00:00:00.000Z`)
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    }, 'must be a real calendar date')

const importedExpenseSchema = z.object({
    date: isoDay,
    description: z.string().trim().min(1, 'is required').max(MAX_DESCRIPTION_CHARS),
    category: z.string().trim().max(MAX_CATEGORY_CHARS).nullish(),
    currencyCode: currencyCode,
    costMinor: minorAmount,
    paidBy: personName,
    // Optional, and absent means EXACT — the shape every import sent before the
    // parser learned to recognise an even split, and the safe default: the shares
    // are what land either way, and EXACT is the mode that promises not to
    // recompute them.
    splitMode: z.enum(['EQUAL', 'EXACT']).optional(),
    shares: z
        .array(z.object({ member: personName, amountMinor: minorAmount }))
        .min(1)
        .max(MAX_MEMBERS),
})

type ImportedExpenseBody = z.infer<typeof importedExpenseSchema>

/** Re-establish the source-ledger invariants for both import destinations. The
 * source names are still the join key when appending; the room-member mapping
 * is deliberately resolved only after this shape has proved self-consistent. */
const refineImportedLedger = (
    sourceNames: readonly string[],
    expenses: readonly ImportedExpenseBody[],
    ctx: z.RefinementCtx
): void => {
    const fail = (message: string, path: (string | number)[]) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, message, path })
    // Zod still runs a parent superRefine when a child refinement has added an
    // issue. Never let the cross-field sum turn an already-invalid wire string
    // such as "12.00" into a thrown SyntaxError.
    const parsedMinor = (value: unknown): bigint | null => {
        if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) return null
        try {
            const amount = BigInt(value)
            return amount <= MAX_SIGNED_MINOR ? amount : null
        } catch {
            return null
        }
    }

    const roster = new Set(sourceNames.map((name) => name.toLowerCase()))
    if (roster.size !== sourceNames.length) fail('every member needs a distinct name', ['members'])

    expenses.forEach((expense, i) => {
        if (!roster.has(expense.paidBy.toLowerCase())) fail('is not one of the members', ['expenses', i, 'paidBy'])

        const seen = new Set<string>()
        let total = 0n
        let amountsParsed = true
        expense.shares.forEach((share, s) => {
            const key = share.member.toLowerCase()
            if (!roster.has(key)) fail('is not one of the members', ['expenses', i, 'shares', s, 'member'])
            if (seen.has(key)) fail('appears twice in this split', ['expenses', i, 'shares', s, 'member'])
            seen.add(key)
            const amount = parsedMinor(share.amountMinor)
            if (amount === null) amountsParsed = false
            else total += amount
        })

        const cost = parsedMinor(expense.costMinor)
        if (cost === null || !amountsParsed) return
        if (cost <= 0n) fail('must be greater than zero', ['expenses', i, 'costMinor'])
        if (total !== cost) fail('the shares must add up to the expense total', ['expenses', i, 'shares'])
    })
}

export const importRoomSchema = z
    .object({
        roomName: z.string().trim().min(1, 'is required').max(80),
        emoji: roomEmblem.nullish(),
        currency: currencyCode,
        creatorName: personName,
        members: z.array(personName).min(1).max(MAX_MEMBERS),
        expenses: z.array(importedExpenseSchema).min(1).max(MAX_EXPENSES),
    })
    .superRefine((body, ctx) => {
        const roster = new Set(body.members.map((name) => name.toLowerCase()))
        if (!roster.has(body.creatorName.toLowerCase()))
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be one of the members', path: ['creatorName'] })
        refineImportedLedger(body.members, body.expenses, ctx)
    })

export type ImportRoomBody = z.infer<typeof importRoomSchema>

const existingImportMember = z.object({ sourceName: personName, memberId: id }).strict()
const newImportMember = z.object({ sourceName: personName, newMemberName: personName }).strict()

export const importIntoRoomSchema = z
    .object({
        members: z
            .array(z.union([existingImportMember, newImportMember]))
            .min(1)
            .max(MAX_MEMBERS),
        expenses: z.array(importedExpenseSchema).min(1).max(MAX_EXPENSES),
    })
    .superRefine((body, ctx) => {
        refineImportedLedger(
            body.members.map((mapping) => mapping.sourceName),
            body.expenses,
            ctx
        )

        // Collapsing two source people onto one room identity would produce
        // duplicate shares and, worse, change the source balances. New names
        // are compared case-insensitively exactly like the room roster; ids are
        // checked here and then proven to belong to this room under its lock.
        const existingIds = new Set<string>()
        const newNames = new Set<string>()
        body.members.forEach((mapping, index) => {
            if ('memberId' in mapping) {
                if (existingIds.has(mapping.memberId)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: 'each source member needs a distinct room member',
                        path: ['members', index, 'memberId'],
                    })
                }
                existingIds.add(mapping.memberId)
                return
            }

            const key = mapping.newMemberName.toLowerCase()
            if (newNames.has(key)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'every new member needs a distinct name',
                    path: ['members', index, 'newMemberName'],
                })
            }
            newNames.add(key)
        })
    })

export type ImportIntoRoomBody = z.infer<typeof importIntoRoomSchema>
