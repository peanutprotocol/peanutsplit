import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./ExpenseComposer.tsx', import.meta.url), 'utf8')
const componentStart = source.indexOf('export function ExpenseComposer')
const body = source.slice(componentStart)

describe('ExpenseComposer entry order and large-amount affordances', () => {
    it('puts amount then description before scan and currency in visible DOM/Tab order', () => {
        const amount = body.indexOf('data-testid="expense-amount"')
        const description = body.indexOf('data-testid="expense-description"')
        const scan = body.indexOf('{amount.action}')
        const currency = body.indexOf('data-testid="expense-currency"')

        expect(componentStart).toBeGreaterThan(-1)
        expect(amount).toBeGreaterThan(-1)
        expect(description).toBeGreaterThan(amount)
        expect(scan).toBeGreaterThan(description)
        expect(currency).toBeGreaterThan(scan)
    })

    it('keeps the input raw while rendering localized formatting as a separate preview', () => {
        expect(body).toContain('value={amount.value}')
        expect(body).toContain('amount.onChange(event.target.value)')
        expect(body).toContain('data-testid="expense-amount-preview"')
        expect(body).toContain('labels.amountPreview(amount.formattedPreview)')
    })

    it('uses at least 16px text on touch widths and retains the denser desktop description', () => {
        expect(body).toContain("'h-14 px-4 text-base font-bold md:text-sm'")
    })

    it('offers a bounded category override after the fast entry controls', () => {
        const picker = body.indexOf('data-testid="expense-category-picker"')
        expect(picker).toBeGreaterThan(body.indexOf('data-testid="expense-currency"'))
        expect(body).toContain('category.options.map')
        expect(body).toContain('aria-pressed={category.value === option.id}')
    })
})
