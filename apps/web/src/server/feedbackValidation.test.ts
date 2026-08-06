import { describe, expect, it } from 'vitest'
import {
    MAX_FEEDBACK_SCREENSHOT_BYTES,
    MAX_FEEDBACK_SCREENSHOT_EDGE,
    MIN_FEEDBACK_MESSAGE_CHARS,
} from '@/lib/feedback-contract'
import {
    FeedbackImageTooLargeError,
    FeedbackImageUnreadableError,
    assertFeedbackSourceFile,
} from '@/lib/feedback-client'
import { feedbackReportSchema } from '@/server/feedbackValidation'

const message = 'The save button stopped responding.'
const emptyAttachments = {
    message,
    consent: { confirmed: true as const, diagnostics: false, roomSnapshot: false, screenshot: false },
}

const diagnostics = {
    browser: { userAgent: 'Test Browser', language: 'en-US', platform: 'test', cookieEnabled: true },
    viewport: {
        width: 390,
        height: 844,
        screenWidth: 390,
        screenHeight: 844,
        devicePixelRatio: 3,
        maxTouchPoints: 5,
    },
    timeZone: 'America/Argentina/Buenos_Aires',
    pwa: { standalone: true, displayMode: 'standalone' as const },
    network: { online: true, effectiveType: '4g' as const, downlinkMbps: 8.5, rttMs: 42, saveData: false },
}

describe('feedbackReportSchema consent boundary', () => {
    it('accepts required text with every optional attachment off', () => {
        expect(feedbackReportSchema.parse(emptyAttachments)).toEqual(emptyAttachments)
    })

    it('requires a separate affirmative confirmation', () => {
        expect(() =>
            feedbackReportSchema.parse({
                ...emptyAttachments,
                consent: { ...emptyAttachments.consent, confirmed: false },
            })
        ).toThrow()
    })

    it('requires consent and payload presence to agree in both directions', () => {
        expect(() =>
            feedbackReportSchema.parse({
                ...emptyAttachments,
                diagnostics,
            })
        ).toThrow('attachment was not consented')

        expect(() =>
            feedbackReportSchema.parse({
                ...emptyAttachments,
                consent: { ...emptyAttachments.consent, diagnostics: true },
            })
        ).toThrow('consented attachment is missing')

        expect(
            feedbackReportSchema.parse({
                ...emptyAttachments,
                diagnostics,
                consent: { ...emptyAttachments.consent, diagnostics: true },
            }).diagnostics
        ).toEqual(diagnostics)
    })

    it('trims text, requires useful text, and rejects unknown diagnostic fields', () => {
        expect(feedbackReportSchema.parse({ ...emptyAttachments, message: `  ${message}  ` }).message).toBe(message)
        expect(() =>
            feedbackReportSchema.parse({ ...emptyAttachments, message: 'x'.repeat(MIN_FEEDBACK_MESSAGE_CHARS - 1) })
        ).toThrow()
        expect(() =>
            feedbackReportSchema.parse({
                ...emptyAttachments,
                consent: { ...emptyAttachments.consent, diagnostics: true },
                diagnostics: { ...diagnostics, currentUrl: '/r/secret-room' },
            })
        ).toThrow()
    })

    it('caps screenshot metadata before any bytes are decoded', () => {
        expect(() =>
            feedbackReportSchema.parse({
                ...emptyAttachments,
                consent: { ...emptyAttachments.consent, screenshot: true },
                screenshot: {
                    imageBase64: 'A'.repeat(16),
                    mimeType: 'image/jpeg',
                    byteLength: MAX_FEEDBACK_SCREENSHOT_BYTES + 1,
                    width: 100,
                    height: 100,
                },
            })
        ).toThrow()

        expect(() =>
            feedbackReportSchema.parse({
                ...emptyAttachments,
                consent: { ...emptyAttachments.consent, screenshot: true },
                screenshot: {
                    imageBase64: 'A'.repeat(16),
                    mimeType: 'image/jpeg',
                    byteLength: 12,
                    width: MAX_FEEDBACK_SCREENSHOT_EDGE + 1,
                    height: 1,
                },
            })
        ).toThrow()
    })
})

describe('feedback screenshot source boundary', () => {
    it('refuses oversized and non-raster source files before decode', () => {
        expect(() => assertFeedbackSourceFile({ size: 20 * 1024 * 1024 + 1, type: 'image/png' })).toThrow(
            FeedbackImageTooLargeError
        )
        expect(() => assertFeedbackSourceFile({ size: 100, type: 'image/svg+xml' })).toThrow(
            FeedbackImageUnreadableError
        )
        expect(() => assertFeedbackSourceFile({ size: 100, type: 'text/html' })).toThrow(FeedbackImageUnreadableError)
    })
})
