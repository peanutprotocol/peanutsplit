'use client'

/**
 * Camera roll → something worth uploading.
 *
 * A phone photo is 12 megapixels and 4MB. The model reads printed text off a
 * 1600px edge exactly as well, so shipping the original buys nothing and costs
 * the moment: on hotel wifi, at the table, with five people waiting, the upload
 * IS the feature's latency. Downscale first, always.
 *
 * Re-encoding to JPEG rather than passing the file through is also what solves
 * HEIC. iPhones hand out `image/heic`, which the API does not take and Node
 * cannot decode — but Safari decodes it natively on the way into a canvas, so
 * drawing and re-exporting produces a JPEG the server understands without a
 * decoder, a dependency, or a special case. Every path here ends in JPEG.
 *
 * Nothing is uploaded from this module and nothing is kept: it returns bytes to
 * the caller, which posts them once and drops them.
 */

/** Longest edge after downscaling. Printed receipt text stays legible well below
 *  this; going lower starts losing the small print at the bottom of a long bill. */
const MAX_EDGE = 1600

/** Bound decode memory before a hostile or accidental giant source reaches a
 *  bitmap. Real phone photos sit far below this; the encoded upload still has
 *  the tighter 8MB limit after resizing. */
export const MAX_SOURCE_IMAGE_BYTES = 40 * 1024 * 1024

/** Mirrors the server ceiling (8MB of image → its base64 length). Checked here
 *  too so an over-large photo fails on the device, before the upload, where the
 *  message "take a new photo" can still be acted on. */
const MAX_BASE64_CHARS = Math.ceil((8 * 1024 * 1024) / 3) * 4

/** First pass is generous; a bill photographed in a dim restaurant is noisy and
 *  noise is what JPEG spends bits on. The retries only exist for the pathological
 *  case (a very large, very detailed image) and step down fast. */
const QUALITY_STEPS = [0.82, 0.65, 0.5]

export interface PreparedImage {
    /** Raw base64, no `data:` prefix — the wire shape the route validates. */
    imageBase64: string
    mimeType: 'image/jpeg'
    /** For the analytics-free debug case and the "still too big" message. */
    byteLength: number
}

export class ImageTooLargeError extends Error {}
export class ImageUnreadableError extends Error {}

export function assertReceiptSourceFile(file: Pick<File, 'size' | 'type'>): void {
    if (file.size === 0) throw new ImageUnreadableError('image is empty')
    if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new ImageTooLargeError('source image is too large to decode')
    const mimeType = file.type.toLowerCase()
    if ((mimeType && !mimeType.startsWith('image/')) || mimeType.startsWith('image/svg')) {
        throw new ImageUnreadableError('file is not a supported raster image')
    }
}

/** `createImageBitmap` is the fast path and the only one that applies EXIF
 *  orientation for us; the `<img>` fallback covers older Safari, where an
 *  object URL and a load event are the whole API. */
async function decode(file: File): Promise<{ width: number; height: number; draw: CanvasImageSource }> {
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
            return { width: bitmap.width, height: bitmap.height, draw: bitmap }
        } catch {
            // Fall through — some engines refuse HEIC here but manage it in <img>.
        }
    }

    const url = URL.createObjectURL(file)
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image()
            element.onload = () => resolve(element)
            element.onerror = () => reject(new ImageUnreadableError('image could not be decoded'))
            element.src = url
        })
        return { width: image.naturalWidth, height: image.naturalHeight, draw: image }
    } finally {
        URL.revokeObjectURL(url)
    }
}

const toBase64 = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(',') + 1)

/** base64 length → decoded byte count, padding included. */
const decodedBytes = (base64: string): number =>
    Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)

export async function prepareReceiptImage(file: File): Promise<PreparedImage> {
    assertReceiptSourceFile(file)
    const { width, height, draw } = await decode(file)
    try {
        if (width === 0 || height === 0) throw new ImageUnreadableError('image has no dimensions')

        const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))

        const context = canvas.getContext('2d')
        if (!context) throw new ImageUnreadableError('no 2d context')
        // White underneath: a PNG receipt scan with a transparent background would
        // otherwise flatten to black, and black-on-black reads as an empty bill.
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(draw, 0, 0, canvas.width, canvas.height)

        for (const quality of QUALITY_STEPS) {
            const base64 = toBase64(canvas.toDataURL('image/jpeg', quality))
            if (base64.length <= MAX_BASE64_CHARS) {
                return { imageBase64: base64, mimeType: 'image/jpeg', byteLength: decodedBytes(base64) }
            }
        }
        throw new ImageTooLargeError('image is too large even after downscaling')
    } finally {
        if (typeof ImageBitmap !== 'undefined' && draw instanceof ImageBitmap) draw.close()
    }
}
