import type { ReceiptParseBody } from '@/server/validation'

/**
 * The bytes a caller labels as an image must actually begin like that image.
 *
 * `mimeType` is otherwise only a string in JSON. Passing it straight through
 * lets an arbitrary base64 payload masquerade as JPEG/PNG/WebP at the model
 * boundary. We only decode the prefix needed for the file signature: the route
 * has already bounded and syntax-checked the complete base64 string, and no
 * later server code needs to decode or retain the photograph.
 */

const JPEG = [0xff, 0xd8, 0xff] as const
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
const RIFF = [0x52, 0x49, 0x46, 0x46] as const
const WEBP = [0x57, 0x45, 0x42, 0x50] as const

const matchesAt = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
    bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte)

export function receiptImageMatchesMimeType(imageBase64: string, mimeType: ReceiptParseBody['mimeType']): boolean {
    // Sixteen base64 characters decode to at least WebP's twelve-byte header.
    // Read a little extra so padding or a short malformed prefix fails closed.
    const bytes = Buffer.from(imageBase64.slice(0, 24), 'base64')

    switch (mimeType) {
        case 'image/jpeg':
            return matchesAt(bytes, JPEG)
        case 'image/png':
            return matchesAt(bytes, PNG)
        case 'image/webp':
            return matchesAt(bytes, RIFF) && matchesAt(bytes, WEBP, 8)
    }
}
