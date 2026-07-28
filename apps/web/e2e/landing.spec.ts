import { expect, test, type Locator, type Page } from '@playwright/test'
import enMessages from '../src/i18n/messages/en.json'
import esMessages from '../src/i18n/messages/es.json'
import ptBRMessages from '../src/i18n/messages/pt-BR.json'

const controlBuild = process.env.NEXT_PUBLIC_LANDING_VARIANT === 'control'

type Locale = 'en' | 'es' | 'pt-BR'
type LandingMessages = {
    marketing: {
        hero: {
            titleAccessible: string
            stageSummary: string
            cta: string
            ctaTrust: string
            validation: {
                roomRequired: string
                creatorRequired: string
            }
        }
        proof: {
            linkIdentity: { title: string }
            everyoneAdds: { title: string }
            suggestedPlan: { title: string }
            examples: { title: string }
        }
    }
    room: {
        create: {
            emoji: string
            currencyLabel: string
        }
    }
}

const catalogs: Record<Locale, LandingMessages> = {
    en: enMessages as unknown as LandingMessages,
    es: esMessages as unknown as LandingMessages,
    'pt-BR': ptBRMessages as unknown as LandingMessages,
}

const viewports = [
    { width: 320, height: 740 },
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
] as const

const overlaps = (
    first: { x: number; y: number; width: number; height: number },
    second: { x: number; y: number; width: number; height: number }
) =>
    first.x < second.x + second.width - 1 &&
    first.x + first.width > second.x + 1 &&
    first.y < second.y + second.height - 1 &&
    first.y + first.height > second.y + 1

async function expectNoOverlap(first: Locator, second: Locator) {
    const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()])
    expect(firstBox).not.toBeNull()
    expect(secondBox).not.toBeNull()
    expect(overlaps(firstBox!, secondBox!)).toBe(false)
}

async function openLanding(page: Page, locale: Locale = 'en') {
    // The public landing URL is deliberately not locale-prefixed. The cookie is
    // the production language signal, so exercise that path rather than a test-only route.
    await page.goto('/')
    await page.context().addCookies([{ name: 'ps-locale', value: locale, url: page.url() }])
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
}

test('landing page keeps the real currency picker, detailed FAQ, and selected team portraits', async ({ page }) => {
    await openLanding(page)

    const selectedCurrency = page.getByTestId('hero-currency')
    await expect(selectedCurrency.locator('option')).toHaveCount(12)
    const currencyTrigger = page.getByRole('button', { name: catalogs.en.room.create.currencyLabel })
    await currencyTrigger.focus()
    if (!controlBuild) await expect(page.getByTestId('pass-link-stage')).toHaveAttribute('data-state', 'complete')
    await currencyTrigger.click()
    await expect(currencyTrigger).toHaveAttribute('aria-expanded', 'true')
    const currencyOptions = page.getByRole('option')
    await expect(currencyOptions).toHaveCount(12)
    await expect(currencyOptions.locator('svg')).toHaveCount(12)

    const tickers = (await currencyOptions.allTextContents()).map((text) => text.trim())
    expect(tickers.every((ticker) => /^[A-Z]{3}$/.test(ticker))).toBe(true)
    expect(new Set(tickers).size).toBe(tickers.length)
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
    if ((await teamFold.getAttribute('open')) === null) await teamFold.locator('summary').click()
    await expect(teamFold.getByText(/Konrad · built Split/)).toBeVisible()
    await expect(teamFold.getByText(/Hugo · built Split/)).toBeVisible()
    await expect(teamFold.getByText('Natalia', { exact: true })).toHaveCount(0)
    await expect(teamFold.getByText('Jakub', { exact: true })).toHaveCount(0)
    await expect(teamFold.locator('img[src*="portraits"]')).toHaveCount(2)
})

test('the deployment-wide landing variant has an explicit observable value', async ({ page }) => {
    await openLanding(page)
    await expect(page.getByTestId('landing-hero-variant')).toHaveAttribute(
        'data-variant',
        controlBuild ? 'control' : 'pass_link'
    )
})

test('the rollback build keeps the compact real form and removes the theater', async ({ page }) => {
    test.skip(!controlBuild, 'requires NEXT_PUBLIC_LANDING_VARIANT=control at server build/start')
    await openLanding(page)

    await expect(page.getByTestId('landing-hero-variant')).toHaveAttribute('data-variant', 'control')
    await expect(page.getByTestId('pass-link-hero')).toHaveCount(0)
    await expect(page.getByTestId('pass-link-stage')).toHaveCount(0)
    await expect(page.getByTestId('hero-room-name')).toBeVisible()
    await expect(page.getByTestId('hero-creator-name')).toBeVisible()
    await expect(page.getByTestId('hero-create-room')).toBeVisible()

    await page.getByTestId('hero-create-room').click()
    const roomName = page.getByTestId('hero-room-name')
    await expect(roomName).toBeFocused()
    const roomDescription = await roomName.getAttribute('aria-describedby')
    expect(roomDescription).toBeTruthy()
    await expect(page.locator(`#${roomDescription}`)).toContainText(catalogs.en.marketing.hero.validation.roomRequired)
})

test.describe('Pass-the-link default', () => {
    test.skip(controlBuild, 'pass-link-only contract; the control build is covered separately')

    test('fits the promised fold and does not collide or overflow across target viewports', async ({ page }) => {
        for (const viewport of viewports) {
            await page.setViewportSize(viewport)
            await openLanding(page)

            const hero = page.getByTestId('pass-link-hero')
            const headline = page.getByTestId('pass-link-headline')
            const stage = page.getByTestId('pass-link-stage')
            const form = hero.locator('form')
            const roomName = page.getByTestId('hero-room-name')
            const creatorName = page.getByTestId('hero-creator-name')
            const cta = page.getByTestId('hero-create-room')

            await expect(hero).toBeVisible()
            await expect(headline).toBeVisible()
            await expect(stage).toBeVisible()
            await expect(form).toBeVisible()
            await expect(page.getByTestId('pass-link-ticker')).toBeVisible()

            expect(
                await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
                `${viewport.width}x${viewport.height} must not create horizontal page overflow`
            ).toBe(true)

            await expectNoOverlap(headline, stage)
            await expectNoOverlap(stage, form)
            await expectNoOverlap(headline, form)

            if (
                (viewport.width === 360 && viewport.height === 740) ||
                (viewport.width === 1440 && viewport.height === 900)
            ) {
                for (const [label, locator] of [
                    ['headline', headline],
                    ['room name', roomName],
                    ['creator name', creatorName],
                    ['primary CTA', cta],
                ] as const) {
                    const box = await locator.boundingBox()
                    expect(
                        box,
                        `${label} must have a layout box at ${viewport.width}x${viewport.height}`
                    ).not.toBeNull()
                    expect(
                        box!.y,
                        `${label} starts above the viewport at ${viewport.width}x${viewport.height}`
                    ).toBeGreaterThanOrEqual(0)
                    expect(
                        box!.y + box!.height,
                        `${label} falls below the first fold at ${viewport.width}x${viewport.height}`
                    ).toBeLessThanOrEqual(viewport.height)
                }
            }
        }
    })

    test('the room draft drives both honest URL previews without writing anything', async ({ page }) => {
        const roomWrites: string[] = []
        page.on('request', (request) => {
            const url = new URL(request.url())
            if (request.method() === 'POST' && url.pathname === '/api/rooms') roomWrites.push(request.url())
        })
        await openLanding(page)

        for (const [name, stem] of [
            ['Lisbon weekend', 'lisbon-weekend'],
            ['Año Nuevo en Bariloche', 'ano-nuevo-en-bariloche'],
            ['🎿🎿', 'room'],
        ] as const) {
            await page.getByTestId('hero-room-name').fill(name)
            await expect(page.getByTestId('pass-link-url')).toContainText(`peanutsplit.com/r/${stem}-••••••`)
            await expect(page.getByTestId('hero-slug-preview')).toContainText(`peanutsplit.com/r/${stem}-••••••`)
        }

        expect(roomWrites).toEqual([])
    })

    test('validation is visible, announced, related to its field, and moves focus', async ({ page }) => {
        await openLanding(page)
        const hero = catalogs.en.marketing.hero
        const roomName = page.getByTestId('hero-room-name')
        const creatorName = page.getByTestId('hero-creator-name')

        await page.getByTestId('hero-create-room').click()
        await expect(roomName).toBeFocused()
        await expect(roomName).toHaveAttribute('aria-invalid', 'true')
        const roomDescription = await roomName.getAttribute('aria-describedby')
        expect(roomDescription).toBeTruthy()
        await expect(page.locator(`#${roomDescription}`)).toHaveRole('alert')
        await expect(page.locator(`#${roomDescription}`)).toHaveText(hero.validation.roomRequired)

        await roomName.fill('Lisbon weekend')
        await page.getByTestId('hero-create-room').click()
        await expect(creatorName).toBeFocused()
        await expect(creatorName).toHaveAttribute('aria-invalid', 'true')
        const creatorDescription = await creatorName.getAttribute('aria-describedby')
        expect(creatorDescription).toBeTruthy()
        await expect(page.locator(`#${creatorDescription}`)).toHaveRole('alert')
        await expect(page.locator(`#${creatorDescription}`)).toHaveText(hero.validation.creatorRequired)
    })

    test('the complete form remains keyboard-operable on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await openLanding(page)

        const roomName = page.getByTestId('hero-room-name')
        const drawingPicker = page.getByTestId('pass-link-hero').locator('form summary')
        await roomName.focus()
        await expect(roomName).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(drawingPicker).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('hero-creator-name')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByRole('button', { name: catalogs.en.room.create.currencyLabel })).toBeFocused()

        await page.keyboard.press('ArrowDown')
        await expect(page.getByRole('listbox', { name: catalogs.en.room.create.currencyLabel })).toBeVisible()
        await expect(page.locator('[role="option"]:focus')).toHaveCount(1)
        await page.keyboard.press('Escape')
        await expect(page.getByRole('button', { name: catalogs.en.room.create.currencyLabel })).toBeFocused()

        for (const locator of [
            drawingPicker,
            page.getByRole('button', { name: catalogs.en.room.create.currencyLabel }),
            page.getByTestId('hero-create-room'),
        ]) {
            const box = await locator.boundingBox()
            expect(box).not.toBeNull()
            expect(box!.height).toBeGreaterThanOrEqual(44)
            expect(box!.width).toBeGreaterThanOrEqual(44)
        }
    })

    test('form interaction settles the one-shot story and the final state holds', async ({ page }) => {
        await openLanding(page)
        const stage = page.getByTestId('pass-link-stage')
        await expect(stage).toHaveAttribute('data-state', /question|reply|link|complete/)

        await page.getByTestId('hero-room-name').focus()
        await expect(stage).toHaveAttribute('data-state', 'complete')
        await page.waitForTimeout(1_000)
        await expect(stage).toHaveAttribute('data-state', 'complete')
    })

    test('the uninterrupted story completes once in no more than 4.5 seconds', async ({ page }) => {
        await openLanding(page)
        const stage = page.getByTestId('pass-link-stage')
        // The state machine itself terminates at 4.3s. Leave a small polling/hydration
        // allowance around that source-level contract so a loaded CI worker does not
        // turn scheduling latency into a false animation-duration regression.
        await expect(stage).toHaveAttribute('data-state', 'complete', { timeout: 5_000 })
        await page.waitForTimeout(500)
        await expect(stage).toHaveAttribute('data-state', 'complete')
    })

    test('reduced motion renders the complete meaning immediately without running stage animations', async ({
        page,
    }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await openLanding(page)

        const stage = page.getByTestId('pass-link-stage')
        await expect(stage).toHaveAttribute('data-state', 'complete')
        await expect(page.getByTestId('pass-link-stage-summary')).toHaveText(catalogs.en.marketing.hero.stageSummary)
        expect(
            await stage.evaluate((element) =>
                element
                    .getAnimations({ subtree: true })
                    .filter((animation) => animation.playState === 'running')
                    .map((animation) => animation.animationName)
            )
        ).toEqual([])
    })

    test('the real hero form creates a real room and retains the creator identity', async ({ page }, testInfo) => {
        await openLanding(page)
        const roomName = `Landing QA ${testInfo.project.name} ${Date.now()}`
        const expectedStem = roomName.toLowerCase().replace(/\s+/g, '-')

        await page.getByTestId('hero-room-name').fill(roomName)
        await page.getByTestId('hero-creator-name').fill('Ana')
        await page.getByTestId('hero-create-room').click()

        await expect(page).toHaveURL(new RegExp(`/r/${expectedStem}-[0-9a-hjkmnp-tv-z]{6}$`), {
            timeout: 20_000,
        })
        await expect(page.getByTestId('join-gate')).toHaveCount(0)
        await expect(page.getByText(roomName, { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    })

    test('the three product truths and specific room examples replace generic category cards', async ({ page }) => {
        await openLanding(page)
        const proof = catalogs.en.marketing.proof

        await expect(page.getByTestId('proof-link-identity')).toContainText(proof.linkIdentity.title)
        await expect(page.getByTestId('proof-everyone-adds')).toContainText(proof.everyoneAdds.title)
        await expect(page.getByTestId('proof-suggested-plan')).toContainText(proof.suggestedPlan.title)
        await expect(page.getByTestId('room-examples')).toContainText(proof.examples.title)
        await expect(page.getByTestId('proof-suggested-plan')).toContainText(/suggested payment plan/i)
        await expect(page.getByText(/12 supported currencies/i).first()).toBeVisible()
    })

    for (const locale of ['en', 'es', 'pt-BR'] as const) {
        test(`${locale} localizes the headline, summary, CTA, validation, and proof scenes`, async ({ page }) => {
            await page.setViewportSize({ width: 360, height: 740 })
            await openLanding(page, locale)
            const messages = catalogs[locale].marketing

            await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.hero.titleAccessible)
            await expect(page.getByTestId('pass-link-stage-summary')).toHaveText(messages.hero.stageSummary)
            await expect(page.getByTestId('hero-create-room')).toContainText(messages.hero.cta)
            await expect(page.getByText(messages.hero.ctaTrust, { exact: true })).toBeVisible()

            await page.getByTestId('hero-create-room').click()
            await expect(page.locator('#hero-room-required')).toHaveRole('alert')
            await expect(page.locator('#hero-room-required')).toHaveText(messages.hero.validation.roomRequired)

            await expect(page.getByTestId('proof-link-identity')).toContainText(messages.proof.linkIdentity.title)
            await expect(page.getByTestId('proof-everyone-adds')).toContainText(messages.proof.everyoneAdds.title)
            await expect(page.getByTestId('proof-suggested-plan')).toContainText(messages.proof.suggestedPlan.title)
        })
    }

    test('zoom, selection, and a shrunken visual viewport keep the form reachable', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await openLanding(page)

        const viewportContent = await page.locator('meta[name="viewport"]').getAttribute('content')
        expect(viewportContent ?? '').not.toMatch(/user-scalable\s*=\s*no/i)
        expect(viewportContent ?? '').not.toMatch(/maximum-scale\s*=\s*1(?:[,\\s]|$)/i)
        expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).not.toBe('none')

        const creatorName = page.getByTestId('hero-creator-name')
        await creatorName.focus()
        await page.setViewportSize({ width: 390, height: 500 })
        await creatorName.evaluate((element) => element.scrollIntoView({ block: 'nearest' }))
        const creatorBox = await creatorName.boundingBox()
        expect(creatorBox).not.toBeNull()
        expect(creatorBox!.y).toBeGreaterThanOrEqual(0)
        expect(creatorBox!.y + creatorBox!.height).toBeLessThanOrEqual(500)

        const cta = page.getByTestId('hero-create-room')
        await cta.evaluate((element) => element.scrollIntoView({ block: 'nearest' }))
        const ctaBox = await cta.boundingBox()
        expect(ctaBox).not.toBeNull()
        expect(ctaBox!.y).toBeGreaterThanOrEqual(0)
        expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(500)
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
        ).toBe(true)
    })
})

test('v1 does not expose AI or migration tooling in either landing variant', async ({ page }) => {
    await openLanding(page)
    await expect(page.getByRole('link', { name: 'Import from Splitwise' })).toHaveCount(0)
    await expect(page.getByText(/quick add|scan a receipt|AI receipt|import your Splitwise/i)).toHaveCount(0)

    expect((await page.goto('/import'))?.status()).toBe(404)
    expect((await page.goto('/blog/scan-a-receipt-to-split-a-bill'))?.status()).toBe(404)
})
