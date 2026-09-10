import { expect, test } from '@playwright/test'

const amounts = (page: import('@playwright/test').Page) => page.getByTestId('tool-result').locator('dd .sr-only')

test('mileage keeps units with their inputs and splits the driver contribution', async ({ page }) => {
    await page.goto('/mileage-split-calculator')
    await expect(page.getByTestId('tool-optional')).not.toHaveAttribute('open')
    await expect(amounts(page)).toHaveText(['£55.00', '£55.00', '£55.00'])
    await page.getByTestId('tool-field-driverShares').locator('..').click()
    await expect(amounts(page)).toHaveText(['£41.25', '£41.25', '£41.25', '£41.25'])
    await expect(page.getByTestId('tool-result')).toContainText('Covered by the driver')
    await page.getByTestId('tool-choice-country').selectOption('DE')
    await expect(page.getByTestId('tool-field-rate')).toHaveValue('0.20')
    await expect(page.getByTestId('tool-field-distance').locator('..')).toContainText('km')
    await expect(amounts(page)).toHaveText(['€15.00', '€15.00', '€15.00', '€15.00'])
    await page.getByTestId('tool-choice-country').selectOption('BR')
    await expect(amounts(page)).toHaveCount(0)
    await expect(page.getByTestId('tool-result')).toContainText('Enter a valid value for mileage rate')
    await page.getByTestId('tool-field-rate').fill('0.2')
    await page.getByTestId('tool-field-passengers').fill('1.5')
    await expect(amounts(page)).toHaveCount(0)
    await page.getByTestId('tool-field-passengers').fill('3')
    await page.getByTestId('tool-field-distance').fill('')
    await expect(amounts(page)).toHaveCount(0)
})

test('custom rate is explicit, rejects unfinished input, and applies only on request', async ({ page }) => {
    await page.goto('/mileage-split-calculator')
    await page.getByTestId('tool-builder-summary').click()
    await expect(page.getByTestId('tool-builder')).toContainText('litres / 100 mi')
    await page.getByTestId('tool-field-fuelPer100').fill('10')
    await page.getByTestId('tool-field-fuelPrice').fill('2')
    await expect(page.getByTestId('tool-field-rate')).toHaveValue('0.55')
    await page.getByTestId('tool-field-wear').fill('')
    await expect(page.getByTestId('tool-builder-apply')).toBeDisabled()
    await page.getByTestId('tool-field-wear').fill('0')
    await page.getByTestId('tool-builder-apply').click()
    await expect(page.getByTestId('tool-field-rate')).toHaveValue('0.2')
    await expect(amounts(page)).toHaveText(['£20.00', '£20.00', '£20.00'])
})

test('rent sizes and optional weights remain clear when the controls are collapsed', async ({ page }) => {
    await page.goto('/rent-split-calculator')
    const optional = page.getByTestId('tool-optional')
    await expect(optional).not.toHaveAttribute('open')
    await expect(amounts(page)).toHaveText(['€500.00', '€500.00', '€500.00'])
    for (const [index, size] of ['10', '20', '30'].entries()) {
        await page.getByTestId('tool-field-size').nth(index).fill(size)
    }
    await expect(amounts(page)).toHaveText(['€250.00', '€500.00', '€750.00'])
    await optional.locator('summary').click()
    await page.getByTestId('tool-field-rich').first().focus()
    await page.getByTestId('tool-field-rich').first().press('End')
    await expect(amounts(page)).toHaveText(['€375.00', '€450.00', '€675.00'])
    await optional.locator('summary').click()
    await expect(optional.locator('summary')).toContainText('Custom weights applied')
    await page.getByTestId('tool-row-name-0').fill('')
    await page.getByTestId('tool-row-name-1').fill('')
    await expect(page.getByTestId('tool-result')).toContainText('Flatmate 1')
    await expect(page.getByTestId('tool-result')).toContainText('Flatmate 2')
    await page.getByTestId('tool-field-people').fill('2')
    await page.getByTestId('tool-field-people').fill('3')
    await expect(page.getByTestId('tool-field-size').nth(2)).toHaveValue('30')
    await expect(amounts(page)).toHaveText(['€375.00', '€450.00', '€675.00'])
})

test('copy confirms success only when the clipboard write succeeds', async ({ page }) => {
    await page.goto('/rent-split-calculator')
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: async () => {
                    throw new Error('Unavailable')
                },
            },
        })
    })
    await page.getByTestId('tool-copy').click()
    await expect(page.getByTestId('tool-copy')).toHaveText('Copy the split')
    await expect(page.getByRole('status')).toContainText('Could not copy')
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: async (text: string) => {
                    ;(window as unknown as { copiedSplit: string }).copiedSplit = text
                },
            },
        })
    })
    await page.getByTestId('tool-copy').click()
    await expect(page.getByTestId('tool-copy')).toHaveText('Copied')
    expect(await page.evaluate(() => (window as unknown as { copiedSplit: string }).copiedSplit)).toContain(
        'Flatmate 1 €500.00'
    )
})

test('unfinished optional shares cannot produce a copied split', async ({ page }) => {
    await page.goto('/mileage-split-calculator')
    const optional = page.getByTestId('tool-optional')
    await optional.locator('summary').click()
    await page.getByTestId('tool-field-share').first().fill('')
    await optional.locator('summary').click()
    await expect(amounts(page)).toHaveCount(0)
    await expect(page.getByTestId('tool-copy')).toHaveCount(0)
    await expect(page.getByTestId('tool-result')).toContainText('Passenger 1')
    await optional.locator('summary').click()
    await page.getByTestId('tool-field-share').first().fill('0')
    await expect(amounts(page)).toHaveText(['£0.00', '£82.50', '£82.50'])
})
