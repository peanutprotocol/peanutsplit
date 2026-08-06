import { Prisma } from '@prisma/client'
import {
    FEEDBACK_RETENTION_DAYS,
    MAX_FEEDBACK_SCREENSHOT_BYTES,
    MAX_FEEDBACK_SNAPSHOT_EXPENSES,
    MAX_FEEDBACK_SNAPSHOT_MEMBERS,
    MAX_FEEDBACK_SNAPSHOT_SETTLEMENTS,
} from '@/lib/feedback-contract'
import { prisma } from '@/server/db'
import { badRequest } from '@/server/http'
import { receiptImageMatchesMimeType } from '@/server/receiptImage'
import type { FeedbackReportBody } from '@/server/feedbackValidation'

const jsonValue = (value: unknown): Prisma.InputJsonValue =>
    JSON.parse(
        JSON.stringify(value, (_key, item) => {
            if (typeof item === 'bigint') return item.toString()
            if (item instanceof Date) return item.toISOString()
            if (Prisma.Decimal.isDecimal(item)) return item.toString()
            return item
        })
    ) as Prisma.InputJsonValue

/** Preserve the person's prose while removing capability URLs from support storage. */
export function redactFeedbackMessage(message: string, roomSlug: string): string {
    // Telemetry redaction normally receives one URL. Here the input is prose, so
    // whitespace must terminate a path or the first /r/ would swallow the rest
    // of the sentence along with the credential.
    const pathsRedacted = message
        .replace(/(\/r)\/[^/?#\s"']+/g, '$1/[slug]')
        .replace(/(\/api\/rooms)\/[^/?#\s"']+/g, '$1/[slug]')
    return pathsRedacted.split(roomSlug).join('[room]')
}

/** Decode only after the string cap and prove the declared size and file type. */
export function decodeFeedbackScreenshot(
    screenshot: NonNullable<FeedbackReportBody['screenshot']>
): Uint8Array<ArrayBuffer> {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(screenshot.imageBase64) || screenshot.imageBase64.length % 4 !== 0) {
        throw badRequest('screenshot must be raw canonical base64', 'VALIDATION_ERROR')
    }
    const bytes = Buffer.from(screenshot.imageBase64, 'base64')
    if (bytes.byteLength !== screenshot.byteLength) {
        throw badRequest('screenshot byte length does not match its payload', 'VALIDATION_ERROR')
    }
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_FEEDBACK_SCREENSHOT_BYTES) {
        throw badRequest('screenshot is too large', 'REQUEST_TOO_LARGE')
    }
    if (!receiptImageMatchesMimeType(screenshot.imageBase64, screenshot.mimeType)) {
        throw badRequest('screenshot bytes do not match the declared MIME type', 'VALIDATION_ERROR')
    }
    // Prisma's Bytes input is deliberately ArrayBuffer-backed; copy out of
    // Node's wider Buffer<ArrayBufferLike> type after validation.
    return Uint8Array.from(bytes)
}

type FeedbackDb = Pick<Prisma.TransactionClient, 'room' | 'feedbackReport'>

/**
 * A support-useful room projection with hard row caps at every fan-out. It
 * includes ledger descriptions, amounts and splits, but never the room slug,
 * member tokens, push endpoints, receipt URLs, device hashes, or audit log.
 */
async function buildRoomSnapshot(db: FeedbackDb, roomId: string) {
    const room = await db.room.findUniqueOrThrow({
        where: { id: roomId },
        select: {
            name: true,
            currency: true,
            emoji: true,
            theme: true,
            locale: true,
            createdAt: true,
            _count: { select: { members: true, expenses: true, settlements: true } },
            members: {
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: MAX_FEEDBACK_SNAPSHOT_MEMBERS,
                select: {
                    id: true,
                    name: true,
                    avatar: true,
                    avatarPalette: true,
                    provisional: true,
                    createdAt: true,
                    removedAt: true,
                },
            },
            expenses: {
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: MAX_FEEDBACK_SNAPSHOT_EXPENSES,
                select: {
                    id: true,
                    description: true,
                    amountMinor: true,
                    currency: true,
                    baseAmountMinor: true,
                    fxRate: true,
                    paidById: true,
                    createdById: true,
                    splitMode: true,
                    date: true,
                    category: true,
                    createdAt: true,
                    deletedAt: true,
                    shares: {
                        orderBy: { id: 'asc' },
                        take: MAX_FEEDBACK_SNAPSHOT_MEMBERS,
                        select: {
                            memberId: true,
                            amountMinor: true,
                            enteredAmountMinor: true,
                            splitWeight: true,
                        },
                    },
                },
            },
            settlements: {
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: MAX_FEEDBACK_SNAPSHOT_SETTLEMENTS,
                select: {
                    id: true,
                    fromId: true,
                    toId: true,
                    createdById: true,
                    amountMinor: true,
                    method: true,
                    note: true,
                    createdAt: true,
                    deletedAt: true,
                },
            },
        },
    })

    return {
        version: 1,
        capturedAt: new Date().toISOString(),
        room: {
            name: room.name,
            currency: room.currency,
            emoji: room.emoji,
            theme: room.theme,
            locale: room.locale,
            createdAt: room.createdAt,
        },
        counts: room._count,
        limits: {
            members: MAX_FEEDBACK_SNAPSHOT_MEMBERS,
            expenses: MAX_FEEDBACK_SNAPSHOT_EXPENSES,
            settlements: MAX_FEEDBACK_SNAPSHOT_SETTLEMENTS,
        },
        truncated: {
            members: room._count.members > room.members.length,
            expenses: room._count.expenses > room.expenses.length,
            settlements: room._count.settlements > room.settlements.length,
        },
        members: room.members,
        expenses: room.expenses,
        settlements: room.settlements,
    }
}

export async function persistFeedbackReport(input: {
    roomId: string
    roomSlug: string
    body: FeedbackReportBody
}): Promise<{ reportId: string }> {
    const screenshot = input.body.screenshot ? decodeFeedbackScreenshot(input.body.screenshot) : null

    return prisma.$transaction(async (tx) => {
        // The write path is a second retention backstop beside the deploy-time
        // sweep. Deleting a report has no reverse cascade: Room is the parent,
        // and there is no reporter/member relation at all.
        await tx.feedbackReport.deleteMany({
            where: { createdAt: { lt: new Date(Date.now() - FEEDBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000) } },
        })
        const snapshot = input.body.consent.roomSnapshot ? await buildRoomSnapshot(tx, input.roomId) : null
        const created = await tx.feedbackReport.create({
            data: {
                roomId: input.roomId,
                message: redactFeedbackMessage(input.body.message, input.roomSlug),
                ...(input.body.diagnostics ? { diagnostics: jsonValue(input.body.diagnostics) } : {}),
                ...(snapshot ? { roomSnapshot: jsonValue(snapshot) } : {}),
                ...(screenshot && input.body.screenshot
                    ? {
                          screenshot,
                          screenshotMimeType: input.body.screenshot.mimeType,
                          screenshotByteLength: screenshot.byteLength,
                          screenshotWidth: input.body.screenshot.width,
                          screenshotHeight: input.body.screenshot.height,
                      }
                    : {}),
            },
            select: { id: true },
        })
        return { reportId: created.id }
    })
}
