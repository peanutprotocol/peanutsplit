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

export type CreateRoomBody = z.infer<typeof createRoomSchema>
export type CreateMemberBody = z.infer<typeof createMemberSchema>
export type ExpenseBody = z.infer<typeof expenseSchema>
export type SettlementBody = z.infer<typeof settlementSchema>
