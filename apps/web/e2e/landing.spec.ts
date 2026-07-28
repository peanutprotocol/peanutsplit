import { expect, test } from '@playwright/test'

test('landing page uses doodles, a compact currency picker, and independent folds', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByTestId('hero-create-room')).toContainText('Make the link')

    const useCases = page.getByRole('heading', { name: 'What people split here' }).locator('..')
    await expect(useCases.locator('li')).toHaveCount(4)
    await expect(useCases.locator('li svg')).toHaveCount(4)

    await page.getByRole('button', { name: 'Currency' }).click()
    const currencyOptions = page.getByRole('option')
    await expect(currencyOptions).toHaveCount(12)
    await expect(currencyOptions.locator('svg')).toHaveCount(12)

    const tickers = (await currencyOptions.allTextContents()).map((text) => text.trim())
    expect(tickers.every((ticker) => /^[A-Z]{3}$/.test(ticker))).toBe(true)
    expect(new Set(tickers).size).toBe(tickers.length)
    const selectedCurrency = page.getByTestId('hero-currency')
    const originalCurrency = await selectedCurrency.inputValue()
    const nextCurrency = tickers.find((ticker) => ticker !== originalCurrency)
    expect(nextCurrency).toBeTruthy()
    await page.getByRole('option', { name: nextCurrency, exact: true }).click()
    await expect(selectedCurrency).toHaveValue(nextCurrency!)

    const readMore = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Not convinced yet? Read more' }),
    })
    const folds = readMore.locator('details')
    await expect(folds).toHaveCount(9)

    await folds.nth(0).locator('summary').click()
    await folds.nth(1).locator('summary').click()
    await expect(folds.nth(0)).toHaveAttribute('open', '')
    await expect(folds.nth(1)).toHaveAttribute('open', '')

    const teamFold = folds.filter({ hasText: 'The people who built it' })
    await teamFold.locator('summary').click()
    await expect(teamFold.getByText(/Konrad · built Split/)).toBeVisible()
    await expect(teamFold.getByText(/Hugo · built Split/)).toBeVisible()
    await expect(teamFold.getByText('Natalia', { exact: true })).toHaveCount(0)
    await expect(teamFold.getByText('Jakub', { exact: true })).toHaveCount(0)
    await expect(teamFold.locator('img[src*="portraits"]')).toHaveCount(2)
})

test('room-creation hero stays usable at a narrow mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    await expect(page.getByTestId('hero-create-room')).toBeVisible()
    await expect(page.getByText('Free · no account · nothing to install')).toBeVisible()
    await expect(page.getByTestId('hero-slug-preview')).toContainText('peanutsplit.com/r/')

    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true)

    await page.getByTestId('hero-create-room').click()
    await expect(page.getByTestId('hero-room-name')).toBeFocused()
    await page.getByTestId('hero-room-name').fill('Lisbon weekend')
    await page.getByTestId('hero-create-room').click()
    await expect(page.getByTestId('hero-creator-name')).toBeFocused()
})

test('v1 does not expose AI or migration tooling', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Import from Splitwise' })).toHaveCount(0)

    expect((await page.goto('/import'))?.status()).toBe(404)
    expect((await page.goto('/blog/scan-a-receipt-to-split-a-bill'))?.status()).toBe(404)
})
