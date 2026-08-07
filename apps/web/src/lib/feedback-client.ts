'use client'

import {
    MAX_FEEDBACK_SCREENSHOT_BYTES,
    MAX_FEEDBACK_SCREENSHOT_EDGE,
    MAX_FEEDBACK_SOURCE_IMAGE_BYTES,
    type FeedbackDiagnostics,
    type FeedbackScreenshotInput,
} from './feedback-contract'

interface NetworkInformationLike {
    effectiveType?: string
    downlink?: number
    rtt?: number
    saveData?: boolean
}

type NavigatorWithDiagnostics = Navigator & {
    standalone?: boolean
    connection?: NetworkInformationLike
    mozConnection?: NetworkInformationLike
    webkitConnection?: NetworkInformationLike
}

const finiteNonNegative = (value: number | undefined, max: number): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(value, max) : undefined

const displayMode = (): FeedbackDiagnostics['pwa']['displayMode'] => {
    for (const mode of ['fullscreen', 'standalone', 'minimal-ui'] as const) {
        if (window.matchMedia?.(`(display-mode: ${mode})`).matches) return mode
    }
    return 'browser'
}

/**
 * The exact allowlist rendered in the attachment preview. No URL, room slug,
 * storage contents, IP address or member key is read here.
 */
export function collectFeedbackDiagnostics(): FeedbackDiagnostics {
    const browser = navigator as NavigatorWithDiagnostics
    const connection = browser.connection ?? browser.mozConnection ?? browser.webkitConnection
    const mode = displayMode()
    const effectiveType = ['slow-2g', '2g', '3g', '4g'].includes(connection?.effectiveType ?? '')
        ? (connection?.effectiveType as FeedbackDiagnostics['network']['effectiveType'])
        : undefined

    return {
        browser: {
            userAgent: browser.userAgent.slice(0, 512),
            language: browser.language.slice(0, 35),
            platform: browser.platform.slice(0, 100),
            cookieEnabled: browser.cookieEnabled,
        },
        viewport: {
            width: Math.max(0, Math.round(window.innerWidth)),
            height: Math.max(0, Math.round(window.innerHeight)),
            screenWidth: Math.max(0, Math.round(window.screen.width)),
            screenHeight: Math.max(0, Math.round(window.screen.height)),
            devicePixelRatio: Math.max(0.1, Math.min(window.devicePixelRatio || 1, 10)),
            maxTouchPoints: Math.max(0, Math.min(browser.maxTouchPoints || 0, 100)),
        },
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone.slice(0, 100),
        pwa: {
            standalone: mode === 'standalone' || browser.standalone === true,
            displayMode: mode,
        },
        network: {
            online: browser.onLine,
            ...(effectiveType ? { effectiveType } : {}),
            ...(finiteNonNegative(connection?.downlink, 100_000) === undefined
                ? {}
                : { downlinkMbps: finiteNonNegative(connection?.downlink, 100_000) }),
            ...(finiteNonNegative(connection?.rtt, 3_600_000) === undefined
                ? {}
                : { rttMs: finiteNonNegative(connection?.rtt, 3_600_000) }),
            ...(typeof connection?.saveData === 'boolean' ? { saveData: connection.saveData } : {}),
        },
    }
}

export class FeedbackImageTooLargeError extends Error {}
export class FeedbackImageUnreadableError extends Error {}
export class ScreenCaptureUnavailableError extends Error {}

export function assertFeedbackSourceFile(file: Pick<File, 'size' | 'type'>): void {
    if (file.size === 0) throw new FeedbackImageUnreadableError('image is empty')
    if (file.size > MAX_FEEDBACK_SOURCE_IMAGE_BYTES)
        throw new FeedbackImageTooLargeError('source image is too large to decode')
    const mimeType = file.type.toLowerCase()
    if ((mimeType && !mimeType.startsWith('image/')) || mimeType.startsWith('image/svg')) {
        throw new FeedbackImageUnreadableError('file is not a supported raster image')
    }
}

async function decodeImage(file: File): Promise<{ width: number; height: number; draw: CanvasImageSource }> {
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
            return { width: bitmap.width, height: bitmap.height, draw: bitmap }
        } catch {
            // Older Safari can decode a format through <img> that it refuses in ImageBitmap.
        }
    }

    const url = URL.createObjectURL(file)
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image()
            element.onload = () => resolve(element)
            element.onerror = () => reject(new FeedbackImageUnreadableError('image could not be decoded'))
            element.src = url
        })
        return { width: image.naturalWidth, height: image.naturalHeight, draw: image }
    } finally {
        URL.revokeObjectURL(url)
    }
}

const encodeCanvas = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new FeedbackImageUnreadableError('image could not be encoded'))),
            'image/jpeg',
            quality
        )
    })

const blobBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : ''
            const comma = result.indexOf(',')
            if (comma < 0) reject(new FeedbackImageUnreadableError('image could not be encoded'))
            else resolve(result.slice(comma + 1))
        }
        reader.onerror = () => reject(new FeedbackImageUnreadableError('image could not be read'))
        reader.readAsDataURL(blob)
    })

/** Decode, bound dimensions, flatten transparency and compress before keeping it in form state. */
export async function prepareFeedbackScreenshot(file: File): Promise<FeedbackScreenshotInput> {
    assertFeedbackSourceFile(file)
    const { width, height, draw } = await decodeImage(file)
    try {
        if (width < 1 || height < 1) throw new FeedbackImageUnreadableError('image has no dimensions')
        const scale = Math.min(1, MAX_FEEDBACK_SCREENSHOT_EDGE / Math.max(width, height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        const context = canvas.getContext('2d')
        if (!context) throw new FeedbackImageUnreadableError('no 2d context')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(draw, 0, 0, canvas.width, canvas.height)

        for (const quality of [0.85, 0.7, 0.55, 0.4]) {
            const blob = await encodeCanvas(canvas, quality)
            if (blob.size <= MAX_FEEDBACK_SCREENSHOT_BYTES) {
                return {
                    imageBase64: await blobBase64(blob),
                    mimeType: 'image/jpeg',
                    byteLength: blob.size,
                    width: canvas.width,
                    height: canvas.height,
                }
            }
        }
        throw new FeedbackImageTooLargeError('image is too large after compression')
    } finally {
        if (typeof ImageBitmap !== 'undefined' && draw instanceof ImageBitmap) draw.close()
    }
}

/**
 * Browser/OS screen picker. This must be called directly from a click handler;
 * no effect or automatic callback is allowed to prompt for screen access.
 */
export async function captureFeedbackScreenshot(): Promise<FeedbackScreenshotInput> {
    const getDisplayMedia = navigator.mediaDevices?.getDisplayMedia
    if (!getDisplayMedia) throw new ScreenCaptureUnavailableError('screen capture is unavailable')

    const stream = await getDisplayMedia.call(navigator.mediaDevices, { video: true, audio: false })
    try {
        const video = document.createElement('video')
        video.muted = true
        video.playsInline = true
        video.srcObject = stream
        await video.play()
        if (video.videoWidth < 1 || video.videoHeight < 1) {
            await new Promise<void>((resolve, reject) => {
                const timeout = window.setTimeout(
                    () => reject(new FeedbackImageUnreadableError('capture timed out')),
                    5_000
                )
                video.onloadedmetadata = () => {
                    window.clearTimeout(timeout)
                    resolve()
                }
            })
        }

        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const context = canvas.getContext('2d')
        if (!context) throw new FeedbackImageUnreadableError('no 2d context')
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const blob = await encodeCanvas(canvas, 0.9)
        return prepareFeedbackScreenshot(new File([blob], 'peanut-split-report.jpg', { type: 'image/jpeg' }))
    } finally {
        for (const track of stream.getTracks()) track.stop()
    }
}
