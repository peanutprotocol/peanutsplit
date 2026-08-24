import { expect } from '@playwright/test'
import { test } from './fixtures'

const cases = [
    { cookie: 'en', locale: 'en', lang: 'en', headline: 'LINK. SPLIT. DONE.' },
    // Values written by the previous production locale set. The first request must preserve the
    // user's choice, then the client provider rewrites the canonical value.
    { cookie: 'es', locale: 'es-419', lang: 'es-419', headline: 'LINK. DIVIDÍ. LISTO.' },
    { cookie: 'pt-BR', locale: 'pt-br', lang: 'pt-BR', headline: 'LINK. DIVIDE. PRONTO.' },
] as const

test('native catalogs own the document and migrate existing locale choices', async ({ page }) => {
    await page.goto('/')

    for (const entry of cases) {
        await page.context().addCookies([{ name: 'ps-locale', value: entry.cookie, url: page.url() }])
        await page.reload()

        await expect(page.locator('html')).toHaveAttribute('lang', entry.lang)
        await expect(page.locator('html')).toHaveAttribute('translate', 'no')
        await expect(page.locator('head > meta[name="google"]')).toHaveAttribute('content', 'notranslate')
        await expect(page.locator('.notranslate')).toHaveCount(0)
        await expect(page.locator('body [translate="no"]')).toHaveCount(0)
        await expect(page.getByTestId('pass-link-headline')).toHaveText(entry.headline)
        await expect(page.getByTestId(`locale-${entry.locale}`)).toHaveAttribute('aria-pressed', 'true')

        await expect
            .poll(async () => {
                const cookie = (await page.context().cookies()).find(({ name }) => name === 'ps-locale')
                return cookie?.value
            })
            .toBe(entry.locale)
    }
})

test('a Ukrainian browser gets Ukrainian on its first paint', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, locale: 'uk-UA' })
    const page = await context.newPage()
    try {
        await page.goto('/')

        await expect(page.locator('html')).toHaveAttribute('lang', 'uk')
        await expect(page.getByTestId('pass-link-headline')).toHaveText('ХТО КОМУ СКІЛЬКИ? SPLIT ПОРАХУЄ.')
        await expect(page.getByTestId('locale-uk')).toHaveAttribute('aria-pressed', 'true')
    } finally {
        await context.close()
    }
})

test('Ukrainian stays on the shared product URLs instead of inventing an SEO route', async ({ page }) => {
    const response = await page.goto('/uk')
    expect(response?.status()).toBe(404)
})
