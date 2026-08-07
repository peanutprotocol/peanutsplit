import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { CurrencyInfo } from '@/lib/api-types'
import type { ScanState } from './scan-state'

vi.mock('next-intl', () => ({
    useLocale: () => 'en',
    useTranslations: () => (key: string, values?: Record<string, string>) =>
        values?.amount ? `${key}:${values.amount}` : key,
}))
vi.mock('@/components/ui/Button', () => ({
    Button: ({
        children,
        variant: _variant,
        shadowSize: _shadowSize,
        ...props
    }: ComponentProps<'button'> & { variant?: string; shadowSize?: string }) =>
        createElement('button', props, children),
}))
vi.mock('@/components/ui/Icon', () => ({ Icon: () => null }))
vi.mock('@/lib/use-settings', () => ({ useFeedback: () => () => undefined }))
vi.mock('../Money', () => ({
    Money: ({ minor }: { minor: string }) => createElement('span', null, minor),
}))

import { ScanReview } from './ScanReview'

const currencies: CurrencyInfo[] = [{ code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2, hasRate: true }]

describe('ScanReview total mismatch', () => {
    it('presents a correct discrepancy as nonblocking information, not a hard error', () => {
        const state: ScanState = {
            items: [{ id: 'item-1', label: 'Dinner', amountInput: '145.00', quantity: null }],
            assignments: {},
            receiptTotalMinor: '15519',
            currency: 'USD',
            merchant: null,
            date: null,
        }

        const html = renderToStaticMarkup(
            <ScanReview
                state={state}
                dispatch={() => undefined}
                decimals={2}
                currencies={currencies}
                onContinue={() => undefined}
                onCancel={() => undefined}
            />
        )

        expect(html).toContain('data-testid="scan-totals"')
        expect(html).toContain('bg-secondary-1')
        expect(html).toContain('role="status"')
        expect(html).toContain('mismatch:')
        expect(html).not.toContain('bg-error-1')
        expect(html).not.toContain('role="alert"')
    })
})
