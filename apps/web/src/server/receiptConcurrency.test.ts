import { describe, expect, it } from 'vitest'
import { acquireReceiptScanSlot, MAX_CONCURRENT_RECEIPT_SCANS } from './receiptConcurrency'

describe('receipt scan concurrency', () => {
    it('bounds the whole process and makes releases idempotent', () => {
        const releases = Array.from({ length: MAX_CONCURRENT_RECEIPT_SCANS }, () => acquireReceiptScanSlot())

        expect(() => acquireReceiptScanSlot()).toThrowError(
            expect.objectContaining({ status: 429, code: 'RATE_LIMITED' })
        )

        releases[0]()
        releases[0]()
        const replacement = acquireReceiptScanSlot()

        replacement()
        for (const release of releases.slice(1)) release()
    })
})
