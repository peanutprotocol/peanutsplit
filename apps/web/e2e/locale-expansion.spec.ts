import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import de from '../src/i18n/messages/de.json'
import fr from '../src/i18n/messages/fr.json'
import pl from '../src/i18n/messages/pl.json'
import { test, expect } from './fixtures'

type ExpansionLocale = 'pl' | 'de' | 'fr'
type ExpansionMessages = {
    marketing: { hero: { titleAccessible: string } }
    room: {
        actions: { addExpense: string }
        create: { title: string }
        settle: { listTitle: string }
    }
}

const cases: Array<{ locale: ExpansionLocale; messages: ExpansionMessages }> = [
    { locale: 'pl', messages: pl },
    { locale: 'de', messages: de },
    { locale: 'fr', messages: fr },
]

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
test.setTimeout(180_000)

const reviewScreenshot = async (page: Page, locale: ExpansionLocale, surface: string) => {
    const root = process.env.LOCALE_REVIEW_DIR
    if (!root) return
    mkdirSync(root, { recursive: true })
    // The Next dev toolbar is test infrastructure, not part of the product. Its
    // fixed launcher otherwise sits over the bottom action bar in review shots.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
    await page.screenshot({
        path: path.join(root, `${locale}-${surface}.png`),
        animations: 'disabled',
    })
}

const expectNoHorizontalOverflow = async (page: Page) => {
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    ).toBe(0)
}

for (const { locale, messages } of cases) {
    test(`${locale} owns the landing, creation, expense room and settle flow`, async ({ page }) => {
        await page.goto('/')
        await page.context().addCookies([{ name: 'ps-locale', value: locale, url: page.url() }])
        await page.reload()

        await expect(page.locator('html')).toHaveAttribute('lang', locale)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.marketing.hero.titleAccessible)
        await expect(page.getByTestId(`locale-${locale}`)).toHaveAttribute('aria-pressed', 'true')
        await expect(page.getByTestId('pass-link-stage')).toHaveAttribute('data-state', 'complete', { timeout: 10_000 })
        await expectNoHorizontalOverflow(page)
        await reviewScreenshot(page, locale, 'home')

        await page.goto('/new')
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.room.create.title)
        await expectNoHorizontalOverflow(page)
        await reviewScreenshot(page, locale, 'new')

        await page.getByTestId('room-name').fill(`${locale.toUpperCase()} review trip`)
        await page.getByTestId('room-currency').selectOption('EUR')
        await page.getByTestId('creator-name').fill('Ana')
        await page.getByTestId('create-room').click()

        await expect(page).toHaveURL(/\/r\/[^/?]+\?roster=1$/, { timeout: 45_000 })
        const checkpoint = page.getByTestId('roster-checkpoint')
        await expect(checkpoint).toBeVisible({ timeout: 45_000 })
        await checkpoint.getByTestId('checkpoint-name').fill('Bea')
        await checkpoint.getByTestId('checkpoint-add').click()
        await expect(checkpoint.locator('[data-testid="checkpoint-member"][data-member="Bea"]')).toBeVisible({
            timeout: 15_000,
        })
        await checkpoint.getByTestId('go-to-room').click()
        await expect(page).toHaveURL(/\/r\/[^/?]+$/)

        await page.getByTestId('open-add-expense').click()
        await page.getByTestId('expense-amount').fill('60')
        await page.getByTestId('expense-description').fill('Dinner')
        await page.getByTestId('save-expense').click()

        const expenseRow = page.locator('[data-testid="expense-row"][data-description="Dinner"]')
        const expenseDrawer = page.getByTestId('expense-drawer')
        const skipShare = page.getByTestId('skip-post-aha-share')
        await expect
            .poll(async () => (await skipShare.isVisible()) || !(await expenseDrawer.isVisible()), { timeout: 45_000 })
            .toBe(true)
        if (await skipShare.isVisible()) await skipShare.click()

        await expect(expenseDrawer).toBeHidden({ timeout: 15_000 })
        await expect(skipShare).toBeHidden({ timeout: 15_000 })
        await expect(expenseRow).toBeVisible({ timeout: 15_000 })
        await expect(page.getByTestId('open-add-expense')).toHaveText(messages.room.actions.addExpense)
        await expectNoHorizontalOverflow(page)
        await reviewScreenshot(page, locale, 'room')

        await page.getByTestId('open-settle').click()
        await expect(page.getByRole('heading', { name: messages.room.settle.listTitle })).toBeVisible()
        await expect(page.getByTestId('transfer-row')).toHaveCount(1)
        await expectNoHorizontalOverflow(page)
        await reviewScreenshot(page, locale, 'settle')
    })
}
