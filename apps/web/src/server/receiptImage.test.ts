import { describe, expect, it } from 'vitest'
import type { ReceiptParseBody } from '@/server/validation'
import { receiptImageMatchesMimeType } from '@/server/receiptImage'

type ReceiptMimeType = ReceiptParseBody['mimeType']

const images = {
    'image/jpeg': Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    ]).toString('base64'),
    'image/png': Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]).toString('base64'),
    'image/webp': Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x08, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    ]).toString('base64'),
} satisfies Record<ReceiptMimeType, string>

const mimeTypes = Object.keys(images) as ReceiptMimeType[]

describe('receiptImageMatchesMimeType', () => {
    it.each(mimeTypes)('accepts bytes carrying the declared %s signature', (mimeType) => {
        expect(receiptImageMatchesMimeType(images[mimeType], mimeType)).toBe(true)
    })

    it.each([
        ['image/jpeg', 'image/png'],
        ['image/png', 'image/webp'],
        ['image/webp', 'image/jpeg'],
    ] as const)('rejects %s bytes declared as %s', (actualType, declaredType) => {
        expect(receiptImageMatchesMimeType(images[actualType], declaredType)).toBe(false)
    })

    it('rejects a truncated or unrecognised decoded prefix', () => {
        expect(receiptImageMatchesMimeType(Buffer.from([0xff, 0xd8]).toString('base64'), 'image/jpeg')).toBe(false)
        expect(receiptImageMatchesMimeType(Buffer.alloc(16).toString('base64'), 'image/png')).toBe(false)
    })
})
