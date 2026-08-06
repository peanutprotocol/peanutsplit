/**
 * The private support-report wire contract.
 *
 * This file is dependency-free so the form and the route share the same hard
 * limits. A room slug, page URL and member token are deliberately absent: the
 * room-scoped route resolves those facts instead of accepting credentials as
 * report data.
 */

export const MAX_FEEDBACK_MESSAGE_CHARS = 4_000
export const MIN_FEEDBACK_MESSAGE_CHARS = 10
export const MAX_FEEDBACK_SCREENSHOT_BYTES = 2 * 1024 * 1024
export const MAX_FEEDBACK_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_FEEDBACK_SCREENSHOT_EDGE = 1_600
export const MAX_FEEDBACK_SNAPSHOT_MEMBERS = 50
export const MAX_FEEDBACK_SNAPSHOT_EXPENSES = 100
export const MAX_FEEDBACK_SNAPSHOT_SETTLEMENTS = 100
/** Target support window for text, diagnostics, snapshots and screenshot bytes.
 * Write/startup cleanup enforces it; ROADMAP tracks the guaranteed daily sweep. */
export const FEEDBACK_RETENTION_DAYS = 90

/** Base64 plus a small, tightly validated diagnostics envelope. */
export const MAX_FEEDBACK_REQUEST_BYTES = Math.ceil(MAX_FEEDBACK_SCREENSHOT_BYTES / 3) * 4 + 24 * 1024

export const FEEDBACK_SCREENSHOT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type FeedbackScreenshotMimeType = (typeof FEEDBACK_SCREENSHOT_MIME_TYPES)[number]

export interface FeedbackDiagnostics {
    browser: {
        userAgent: string
        language: string
        platform: string
        cookieEnabled: boolean
    }
    viewport: {
        width: number
        height: number
        screenWidth: number
        screenHeight: number
        devicePixelRatio: number
        maxTouchPoints: number
    }
    timeZone: string
    pwa: {
        standalone: boolean
        displayMode: 'browser' | 'minimal-ui' | 'standalone' | 'fullscreen'
    }
    network: {
        online: boolean
        effectiveType?: 'slow-2g' | '2g' | '3g' | '4g'
        downlinkMbps?: number
        rttMs?: number
        saveData?: boolean
    }
}

export interface FeedbackScreenshotInput {
    /** Raw base64 only; data URLs are rejected by the server. */
    imageBase64: string
    mimeType: FeedbackScreenshotMimeType
    byteLength: number
    width: number
    height: number
}

export interface FeedbackReportInput {
    message: string
    consent: {
        /** A separate, unchecked acknowledgement in the form. */
        confirmed: true
        diagnostics: boolean
        roomSnapshot: boolean
        screenshot: boolean
    }
    diagnostics?: FeedbackDiagnostics
    screenshot?: FeedbackScreenshotInput
}

export interface FeedbackReportResult {
    reportId: string
}
