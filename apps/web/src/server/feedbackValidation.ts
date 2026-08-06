import { z } from 'zod'
import {
    FEEDBACK_SCREENSHOT_MIME_TYPES,
    MAX_FEEDBACK_MESSAGE_CHARS,
    MAX_FEEDBACK_SCREENSHOT_BYTES,
    MAX_FEEDBACK_SCREENSHOT_EDGE,
    MIN_FEEDBACK_MESSAGE_CHARS,
} from '@/lib/feedback-contract'

const shortText = (max: number) => z.string().max(max)
const screenshotDimension = z.number().int().min(1).max(MAX_FEEDBACK_SCREENSHOT_EDGE)

const diagnosticsSchema = z
    .object({
        browser: z
            .object({
                userAgent: shortText(512),
                language: shortText(35),
                platform: shortText(100),
                cookieEnabled: z.boolean(),
            })
            .strict(),
        viewport: z
            .object({
                width: z.number().int().min(0).max(20_000),
                height: z.number().int().min(0).max(20_000),
                screenWidth: z.number().int().min(0).max(20_000),
                screenHeight: z.number().int().min(0).max(20_000),
                devicePixelRatio: z.number().min(0.1).max(10),
                maxTouchPoints: z.number().int().min(0).max(100),
            })
            .strict(),
        timeZone: shortText(100),
        pwa: z
            .object({
                standalone: z.boolean(),
                displayMode: z.enum(['browser', 'minimal-ui', 'standalone', 'fullscreen']),
            })
            .strict(),
        network: z
            .object({
                online: z.boolean(),
                effectiveType: z.enum(['slow-2g', '2g', '3g', '4g']).optional(),
                downlinkMbps: z.number().min(0).max(100_000).optional(),
                rttMs: z.number().min(0).max(3_600_000).optional(),
                saveData: z.boolean().optional(),
            })
            .strict(),
    })
    .strict()

const maxBase64Chars = Math.ceil(MAX_FEEDBACK_SCREENSHOT_BYTES / 3) * 4

const screenshotSchema = z
    .object({
        imageBase64: z.string().min(16).max(maxBase64Chars),
        mimeType: z.enum(FEEDBACK_SCREENSHOT_MIME_TYPES),
        byteLength: z.number().int().min(1).max(MAX_FEEDBACK_SCREENSHOT_BYTES),
        width: screenshotDimension,
        height: screenshotDimension,
    })
    .strict()

/** Every optional attachment must agree in both directions with its consent toggle. */
export const feedbackReportSchema = z
    .object({
        message: z
            .string()
            .max(MAX_FEEDBACK_MESSAGE_CHARS)
            .transform((value) => value.trim())
            .refine((value) => value.length >= MIN_FEEDBACK_MESSAGE_CHARS, {
                message: `must contain at least ${MIN_FEEDBACK_MESSAGE_CHARS} characters`,
            }),
        consent: z
            .object({
                confirmed: z.literal(true),
                diagnostics: z.boolean(),
                roomSnapshot: z.boolean(),
                screenshot: z.boolean(),
            })
            .strict(),
        diagnostics: diagnosticsSchema.optional(),
        screenshot: screenshotSchema.optional(),
    })
    .strict()
    .superRefine((body, ctx) => {
        const attachmentPairs = [
            ['diagnostics', body.diagnostics !== undefined, body.consent.diagnostics],
            ['screenshot', body.screenshot !== undefined, body.consent.screenshot],
        ] as const
        for (const [field, attached, consented] of attachmentPairs) {
            if (attached === consented) continue
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [field],
                message: consented ? 'consented attachment is missing' : 'attachment was not consented',
            })
        }
    })

export type FeedbackReportBody = z.infer<typeof feedbackReportSchema>
