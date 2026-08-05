import { describe, expect, it } from 'vitest'
import { assertReceiptSourceFile, ImageTooLargeError, ImageUnreadableError, MAX_SOURCE_IMAGE_BYTES } from './scan-image'

describe('receipt source file gate', () => {
    it('allows ordinary raster images and browser-decoded HEIC', () => {
        expect(() => assertReceiptSourceFile({ size: 500_000, type: 'image/jpeg' })).not.toThrow()
        expect(() => assertReceiptSourceFile({ size: 2_000_000, type: 'image/heic' })).not.toThrow()
        expect(() => assertReceiptSourceFile({ size: 500_000, type: '' })).not.toThrow()
    })

    it('rejects empty, non-image and SVG sources before browser decode', () => {
        expect(() => assertReceiptSourceFile({ size: 0, type: 'image/jpeg' })).toThrow(ImageUnreadableError)
        expect(() => assertReceiptSourceFile({ size: 100, type: 'text/html' })).toThrow(ImageUnreadableError)
        expect(() => assertReceiptSourceFile({ size: 100, type: 'image/svg+xml' })).toThrow(ImageUnreadableError)
    })

    it('rejects giant originals before allocating a bitmap', () => {
        expect(() => assertReceiptSourceFile({ size: MAX_SOURCE_IMAGE_BYTES + 1, type: 'image/jpeg' })).toThrow(
            ImageTooLargeError
        )
    })
})
