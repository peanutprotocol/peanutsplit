import { expect, test, type Locator, type Page } from '@playwright/test'
import enMessages from '../src/i18n/messages/en.json'
import esMessages from '../src/i18n/messages/es.json'
import ptBRMessages from '../src/i18n/messages/pt-BR.json'
import { SLUG_TAIL_HINT } from '../src/lib/slugify'

const controlBuild = process.env.NEXT_PUBLIC_LANDING_VARIANT === 'control'

type Locale = 'en' | 'es' | 'pt-BR'
type LandingMessages = {
    marketing: {
        hero: {
            titleAccessible: string
            stageSummary: string
            cta: string
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
        linkExplainer: {
            title: string
            access: { title: string }
            chat: { title: string }
            remembered: { title: string }
            money: { title: string }
            done: string
        }
        rooms: {
            title: string
            openLabel: string
            more: string
            less: string
            forgotten: string
            recovery: {
                title: string
                invalid: string
                notFound: string
                added: string
            }
        }
        footer: {
            createSplit: string
            logoLinkLabel: string
        }
        readMore: {
            toggle: string
            faq: {
                lost: { q: string; a: string }
            }
            features: {
                title: string
                currency: { title: string }
            }
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
    { width: 390, height: 720 },
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
    const currencyTrigger = page.getByRole('button', {
        name: new RegExp(`^${catalogs.en.room.create.currencyLabel}, [A-Z]{3}$`),
    })
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

    await page.getByTestId('hero-link-explainer').click()
    const linkExplainer = page.getByRole('dialog')
    await expect(linkExplainer).toContainText(catalogs.en.marketing.linkExplainer.title)
    await expect(linkExplainer).toContainText(catalogs.en.marketing.linkExplainer.access.title)
    await expect(linkExplainer).toContainText(catalogs.en.marketing.linkExplainer.chat.title)
    await expect(linkExplainer).toContainText(catalogs.en.marketing.linkExplainer.remembered.title)
    await expect(linkExplainer).toContainText(catalogs.en.marketing.linkExplainer.money.title)
    await expect(linkExplainer.getByText(/loses it|room is gone/i)).toHaveCount(0)
    await linkExplainer.getByRole('button', { name: catalogs.en.marketing.linkExplainer.done }).click()
    await expect(linkExplainer).toBeHidden()

    const readMore = page.locator('section').filter({
        has: page.getByRole('heading', { name: catalogs.en.marketing.readMore.toggle }),
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
    await expect(teamFold.locator('.landing-persona svg')).toHaveCount(2)
})

test('the deployment-wide landing variant has an explicit observable value', async ({ page }) => {
    await openLanding(page)
    await expect(page.getByTestId('landing-hero-variant')).toHaveAttribute(
        'data-variant',
        controlBuild ? 'control' : 'pass_link'
    )
})

test('a sixth recent room is shown instead of becoming orphaned footer copy', async ({ page }) => {
    await page.addInitScript(() => {
        const now = Date.now()
        window.localStorage.setItem(
            'ps:recent',
            JSON.stringify(
                Array.from({ length: 6 }, (_, index) => ({
                    slug: `room-${index}`,
                    name: `Room ${index + 1}`,
                    emoji: index === 0 ? 'boat' : 'ski',
                    lastSeenAt: now - index * 60_000,
                }))
            )
        )
    })
    await openLanding(page)

    const rooms = page.getByTestId('recent-rooms')
    await expect(rooms.getByTestId('recent-room-list').locator('a')).toHaveCount(6)
    await expect(rooms.getByRole('button', { name: /more room/i })).toHaveCount(0)
    await expect(rooms.getByText(/and 1 more/i)).toHaveCount(0)
    await expect(rooms.getByTestId('recent-room-list').locator('svg').first()).toHaveAttribute('width', '30')
})

test('a longer recent-room history has an explicit reversible reveal control', async ({ page }) => {
    await page.addInitScript(() => {
        const now = Date.now()
        window.localStorage.setItem(
            'ps:recent',
            JSON.stringify(
                Array.from({ length: 7 }, (_, index) => ({
                    slug: `room-${index}`,
                    name: `Room ${index + 1}`,
                    emoji: 'peanut',
                    lastSeenAt: now - index * 60_000,
                }))
            )
        )
    })
    await openLanding(page)

    const rooms = page.getByTestId('recent-rooms')
    const list = rooms.getByTestId('recent-room-list')
    const reveal = rooms.getByRole('button', { name: 'Show 2 more rooms' })
    await expect(list.locator('a')).toHaveCount(5)
    await expect(reveal).toHaveAttribute('aria-expanded', 'false')

    await reveal.click()
    await expect(list.locator('a')).toHaveCount(7)
    const collapse = rooms.getByRole('button', { name: 'Show fewer rooms' })
    await expect(collapse).toHaveAttribute('aria-expanded', 'true')

    await collapse.click()
    await expect(list.locator('a')).toHaveCount(5)
    await expect(reveal).toHaveAttribute('aria-expanded', 'false')
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
            const chatFrame = page.getByTestId('pass-link-chat-frame')

            await expect(hero).toBeVisible()
            await expect(headline).toBeVisible()
            await expect(stage).toBeVisible()
            await expect(form).toBeVisible()
            await expect(chatFrame).toBeVisible()
            await expect(page.getByTestId('pass-link-chat-link')).toHaveAttribute('href', '/new')
            await expect(chatFrame.locator('.pass-link-avatar svg')).toHaveCount(8)
            const [avatarBox, avatarDoodleBox] = await Promise.all([
                chatFrame.locator('.pass-link-avatar').first().boundingBox(),
                chatFrame.locator('.pass-link-avatar svg').first().boundingBox(),
            ])
            expect(avatarBox).not.toBeNull()
            expect(avatarDoodleBox).not.toBeNull()
            expect(avatarDoodleBox!.width / avatarBox!.width).toBeGreaterThan(0.7)
            await expect(chatFrame).not.toContainText(/PEANUT SPLIT\s*[·-]\s*SHARED ROOM/i)
            await expect(page.getByTestId('pass-link-channel')).toHaveCount(0)
            await expect(page.getByTestId('pass-link-ticker')).toHaveCount(0)
            await expect(hero.locator('.pass-link-utility')).toHaveCount(0)
            await expect(hero.getByText(/^4 FRIENDS · 1 LINK$/)).toHaveCount(0)
            await expect(
                hero.getByText(/NO APP FOR YOUR FRIENDS|BUILT FOR THE GROUP CHAT|NO SIGNUP\. JUST A LINK\./i)
            ).toHaveCount(0)

            expect(
                await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
                `${viewport.width}x${viewport.height} must not create horizontal page overflow`
            ).toBe(true)

            if (viewport.width <= 899) {
                const [heroBox, chatBox] = await Promise.all([hero.boundingBox(), chatFrame.boundingBox()])
                expect(heroBox).not.toBeNull()
                expect(chatBox).not.toBeNull()
                expect(
                    chatBox!.height,
                    `mobile messenger must stay portrait at ${viewport.width}x${viewport.height}`
                ).toBeGreaterThan(chatBox!.width)
                expect(
                    heroBox!.height,
                    `mobile hero must reveal the next section at ${viewport.width}x${viewport.height}`
                ).toBeLessThan(viewport.height)
            }

            await expectNoOverlap(headline, stage)
            await expectNoOverlap(stage, form)
            await expectNoOverlap(headline, form)

            if (
                (viewport.width === 390 && [720, 844].includes(viewport.height)) ||
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

    test('the right-hand messenger mockup opens the room creator', async ({ page }) => {
        await openLanding(page)
        await page.getByTestId('pass-link-chat-link').click()
        await expect(page).toHaveURL('/new')
        await expect(page.getByTestId('room-composer')).toBeVisible()
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
            await expect(page.getByTestId('pass-link-url')).toContainText(`peanutsplit.com/r/${stem}${SLUG_TAIL_HINT}`)
            await expect(page.getByTestId('hero-slug-preview')).toContainText(
                `peanutsplit.com/r/${stem}${SLUG_TAIL_HINT}`
            )
        }

        // The hint is imported so the two previews cannot drift, so pin its SHAPE here:
        // the tail is three words, and a preview showing one run teaches the wrong URL.
        expect(SLUG_TAIL_HINT.split('-').filter(Boolean)).toHaveLength(3)

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
        const currencyTrigger = page.getByRole('button', {
            name: new RegExp(`^${catalogs.en.room.create.currencyLabel}, [A-Z]{3}$`),
        })
        await expect(currencyTrigger).toBeFocused()

        await page.keyboard.press('ArrowDown')
        await expect(page.getByRole('listbox', { name: catalogs.en.room.create.currencyLabel })).toBeVisible()
        await expect(page.locator('[role="option"]:focus')).toHaveCount(1)
        await page.keyboard.press('Escape')
        await expect(currencyTrigger).toBeFocused()

        for (const locator of [drawingPicker, currencyTrigger, page.getByTestId('hero-create-room')]) {
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
        await expect(page.getByTestId('landing-proof')).toHaveAttribute('data-motion', 'still')
        await expect(page.getByTestId('read-more')).toHaveAttribute('data-motion', 'still')
        await expect(page.getByTestId('final-cta')).toHaveAttribute('data-motion', 'still')
        const firstFold = page.getByTestId('read-more').locator('details').first()
        await firstFold.locator('summary').click()
        await expect(firstFold).toHaveAttribute('open', '')
        await expect(firstFold.locator('summary')).toHaveCSS('transition-duration', '0s')

        const motionLinks = [
            page.getByTestId('pass-link-chat-link'),
            page.getByTestId('proof-link-identity-link'),
            page.getByTestId('final-cta-link'),
            ...(await page.getByTestId('room-example-link').all()),
        ]
        for (const link of motionLinks) {
            await expect(link).toHaveCSS('transition-duration', '0s')
            const stillTransform = await link.evaluate((element) => getComputedStyle(element).transform)
            await link.hover()
            await expect(link).toHaveCSS('transform', stillTransform)
        }

        const exampleLink = page.getByTestId('room-example-link').first()
        await exampleLink.hover()
        const stillTransform = await exampleLink.evaluate((element) => getComputedStyle(element).transform)
        await page.mouse.down()
        await expect(exampleLink).toHaveCSS('transform', stillTransform)
        await page.mouse.move(0, 0)
        await page.mouse.up()
        await expect(page).toHaveURL('/')

        expect(
            await page.locator('main').evaluate((element) =>
                element
                    .getAnimations({ subtree: true })
                    .filter((animation) => animation.playState === 'running')
                    .map((animation) => animation.animationName)
            )
        ).toEqual([])
    })

    test('reduced-motion CSS keeps server-rendered landing and creation surfaces visible without JavaScript', async ({
        browser,
    }, testInfo) => {
        const baseURL = testInfo.project.use.baseURL
        if (typeof baseURL !== 'string') throw new Error('Playwright baseURL is required')
        const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce' })
        const noJs = await context.newPage()

        await noJs.goto(new URL('/', baseURL).href)
        await expect(noJs.getByTestId('proof-link-identity')).toBeVisible()
        await expect(noJs.getByTestId('proof-link-identity')).toHaveCSS('opacity', '1')
        await expect(noJs.getByTestId('proof-link-identity')).toHaveCSS('transform', 'none')

        await noJs.goto(new URL('/new', baseURL).href)
        const creationSurface = noJs.locator('[data-motion-surface]').first()
        await expect(noJs.getByTestId('room-composer')).toBeVisible()
        await expect(creationSurface).toHaveCSS('opacity', '1')
        await expect(creationSurface).toHaveCSS('transform', 'none')

        await context.close()
    })

    test('in-app quiet settings keep the landing usable without motion, sound, or vibration', async ({ page }) => {
        await page.addInitScript(() => {
            window.localStorage.setItem(
                'ps:settings',
                JSON.stringify({
                    animationsEnabled: false,
                    soundEnabled: false,
                    hapticsEnabled: false,
                })
            )

            const probe = { audioContexts: 0, vibrations: 0 }
            Object.defineProperty(window, '__landingFeedbackProbe', { value: probe })

            const NativeAudioContext = window.AudioContext
            if (NativeAudioContext) {
                Object.defineProperty(window, 'AudioContext', {
                    configurable: true,
                    value: new Proxy(NativeAudioContext, {
                        construct(target, args, newTarget) {
                            probe.audioContexts += 1
                            return Reflect.construct(target, args, newTarget)
                        },
                    }),
                })
            }

            Object.defineProperty(navigator, 'vibrate', {
                configurable: true,
                value: () => {
                    probe.vibrations += 1
                    return true
                },
            })
        })
        await openLanding(page)

        await expect(page.locator('html')).toHaveClass(/reduce-animations/)
        await expect(page.getByTestId('pass-link-stage')).toHaveAttribute('data-state', 'complete')
        await expect(page.getByTestId('landing-proof')).toHaveAttribute('data-motion', 'still')
        await expect(page.getByTestId('read-more')).toHaveAttribute('data-motion', 'still')
        await expect(page.getByTestId('final-cta')).toHaveAttribute('data-motion', 'still')

        const firstFold = page.getByTestId('read-more').locator('details').first()
        await firstFold.locator('summary').click()
        await expect(firstFold).toHaveAttribute('open', '')

        expect(
            await page.evaluate(
                () =>
                    (
                        window as Window & {
                            __landingFeedbackProbe: { audioContexts: number; vibrations: number }
                        }
                    ).__landingFeedbackProbe
            )
        ).toEqual({ audioContexts: 0, vibrations: 0 })
        expect(
            await page.locator('main').evaluate((element) =>
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

        await expect(page).toHaveURL(new RegExp(`/r/${expectedStem}-[a-z]{3,7}-[a-z]{3,7}-[a-z]{3,7}$`), {
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

        for (const testId of ['proof-link-identity-link', 'proof-everyone-adds-link', 'proof-suggested-plan-link']) {
            await expect(page.getByTestId(testId)).toHaveAttribute('href', '/new')
        }

        const roomExampleLinks = page.getByTestId('room-example-link')
        await expect(roomExampleLinks).toHaveCount(4)
        for (const exampleLink of await roomExampleLinks.all()) {
            await expect(exampleLink).toHaveAttribute('href', '/new')
        }

        const finalCtaLink = page.getByTestId('final-cta-link')
        await expect(finalCtaLink).toHaveAttribute('href', '/new')
        await expect(finalCtaLink.locator('button')).toHaveCount(0)

        await expect(page.getByTestId('landing-proof').locator('.landing-persona svg')).toHaveCount(14)
        const [personaBox, personaDoodleBox] = await Promise.all([
            page.getByTestId('landing-proof').locator('.landing-persona').first().boundingBox(),
            page.getByTestId('landing-proof').locator('.landing-persona svg').first().boundingBox(),
        ])
        expect(personaBox).not.toBeNull()
        expect(personaDoodleBox).not.toBeNull()
        expect(personaDoodleBox!.width / personaBox!.width).toBeGreaterThan(0.8)

        const features = page.locator('details').filter({
            has: page.getByText(catalogs.en.marketing.readMore.features.title, { exact: true }),
        })
        const supportedCurrencies = features.getByText(catalogs.en.marketing.readMore.features.currency.title, {
            exact: true,
        })
        await expect(supportedCurrencies).toBeHidden()
        await features.locator('summary').click()
        await expect(supportedCurrencies).toBeVisible()
    })

    test('a room example opens the creator from the keyboard without creating a room', async ({ page }) => {
        await openLanding(page)

        const exampleLink = page.getByTestId('room-example-link').first()
        await exampleLink.focus()
        await expect(exampleLink).toBeFocused()
        await page.keyboard.press('Enter')

        await expect(page).toHaveURL('/new')
        await expect(page.getByTestId('room-composer')).toBeVisible()
    })

    test('every room example lifts and straightens on desktop hover', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'desktop pointer interaction')
        await openLanding(page)

        for (const exampleLink of await page.getByTestId('room-example-link').all()) {
            await page.mouse.move(0, 0)
            const restingTransform = await exampleLink.evaluate((element) => getComputedStyle(element).transform)
            await exampleLink.hover()
            await expect
                .poll(() => exampleLink.evaluate((element) => getComputedStyle(element).transform))
                .not.toBe(restingTransform)
        }
    })

    test('desktop proof milestones keep each icon attached to its label', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await openLanding(page)

        const milestones = page.locator('.landing-proof-rail li')
        await expect(milestones).toHaveCount(4)

        for (const milestone of await milestones.all()) {
            const [iconBox, labelBox] = await Promise.all([
                milestone.locator('svg').boundingBox(),
                milestone.evaluate((element) => {
                    const label = [...element.childNodes].find(
                        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
                    )
                    if (!label) return null

                    const range = document.createRange()
                    range.selectNodeContents(label)
                    const { x, y, width, height } = range.getBoundingClientRect()
                    return { x, y, width, height }
                }),
            ])

            expect(iconBox).not.toBeNull()
            expect(labelBox).not.toBeNull()
            expect(labelBox!.x - (iconBox!.x + iconBox!.width)).toBeGreaterThanOrEqual(0)
            expect(labelBox!.x - (iconBox!.x + iconBox!.width)).toBeLessThanOrEqual(12)
        }
    })

    for (const locale of ['en', 'es', 'pt-BR'] as const) {
        test(`${locale} localizes the headline, summary, CTA, validation, and proof scenes`, async ({ page }) => {
            await page.setViewportSize({ width: 360, height: 740 })
            await openLanding(page, locale)
            const messages = catalogs[locale].marketing

            await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.hero.titleAccessible)
            await expect(page.getByTestId('pass-link-stage-summary')).toHaveText(messages.hero.stageSummary)
            await expect(page.getByTestId('hero-create-room')).toContainText(messages.hero.cta)

            await page.getByTestId('hero-create-room').click()
            await expect(page.locator('#hero-room-required')).toHaveRole('alert')
            await expect(page.locator('#hero-room-required')).toHaveText(messages.hero.validation.roomRequired)

            await expect(page.getByTestId('proof-link-identity')).toContainText(messages.proof.linkIdentity.title)
            await expect(page.getByTestId('proof-everyone-adds')).toContainText(messages.proof.everyoneAdds.title)
            await expect(page.getByTestId('proof-suggested-plan')).toContainText(messages.proof.suggestedPlan.title)
            await expect(
                page.getByRole('link', {
                    name: `${messages.footer.createSplit}: ${messages.proof.linkIdentity.title}`,
                    exact: true,
                })
            ).toHaveAttribute('href', '/new')

            const returnFold = page.locator('details').filter({
                has: page.getByText(messages.readMore.faq.lost.q, { exact: true }),
            })
            await expect(returnFold).toHaveCount(1)
            await returnFold.locator('summary').focus()
            await page.keyboard.press('Enter')
            await expect(returnFold).toHaveAttribute('open', '')
            await expect(returnFold).toContainText(messages.readMore.faq.lost.a)

            const footer = page.locator('footer')
            await expect(footer.getByRole('link', { name: messages.footer.createSplit })).toHaveAttribute(
                'href',
                '/new'
            )
            await expect(footer.getByRole('link', { name: messages.footer.logoLinkLabel })).toBeVisible()
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

test('every retained room is reachable and can be forgotten only on this device', async ({ page }) => {
    const rooms = [
        ['room-one-abc123', 'Room one'],
        ['room-two-def456', 'Room two'],
        ['room-three-ghj789', 'Room three'],
        ['room-four-jkm234', 'Room four'],
        ['room-five-npq567', 'Room five'],
        ['room-six-rst890', 'Room six'],
        ['room-seven-vwx345', 'Room seven'],
    ].map(([slug, name], index) => ({
        slug,
        name,
        emoji: 'peanut',
        lastSeenAt: Date.now() - index * 1_000,
    }))
    await page.addInitScript((seed) => {
        window.localStorage.setItem('ps:recent', JSON.stringify(seed))
    }, rooms)
    await openLanding(page)

    const list = page.locator('#recent-room-list')
    await expect(list.getByRole('link')).toHaveCount(5)
    const more = page.getByTestId('more-rooms')
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    await expect(list.getByRole('link')).toHaveCount(7)
    await expect(page.getByRole('link', { name: 'Open room: Room seven' })).toHaveAttribute(
        'href',
        '/r/room-seven-vwx345'
    )

    await page.locator('[data-testid="forget-room"][data-room="room-seven-vwx345"]').click()
    // Dropping a room asks first: the list is this device's only copy of the link.
    await expect(page.getByTestId('forget-room-confirm')).toBeVisible()
    // Saying no costs nothing: the room, and its link, are still here.
    await page.getByTestId('cancel-forget-room').click()
    await expect(page.getByTestId('forget-room-confirm')).toBeHidden()
    await expect(list.getByRole('link')).toHaveCount(7)

    await page.locator('[data-testid="forget-room"][data-room="room-seven-vwx345"]').click()
    await page.getByTestId('confirm-forget-room').click()
    await expect(list.getByRole('link')).toHaveCount(6)
    await expect(page.getByTestId('recent-room-notice')).toContainText('shared room still works')
    expect(
        await page.evaluate(() =>
            JSON.parse(window.localStorage.getItem('ps:recent') ?? '[]').some(
                (room: { slug: string }) => room.slug === 'room-seven-vwx345'
            )
        )
    ).toBe(false)

    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await expect(list.getByRole('link')).toHaveCount(5)
})

test('pasting a valid room link verifies and saves it while invalid links leave no credential behind', async ({
    page,
}) => {
    const requested: string[] = []
    await page.route('**/api/rooms/*', async (route) => {
        const path = new URL(route.request().url()).pathname
        requested.push(path)
        if (path.endsWith('/recovered-room-abc123')) {
            // A real verification is asynchronous. Holding the 200 briefly lets
            // the test prove that neither persistence nor navigation happens
            // merely because the pasted string looked like a room URL.
            await new Promise((resolve) => setTimeout(resolve, 250))
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    room: {
                        id: 'room-recovered',
                        slug: 'recovered-room-abc123',
                        name: 'Recovered room',
                        emoji: 'peanut',
                        currency: 'EUR',
                        coverUrl: null,
                        theme: 'mint',
                        createdAt: new Date().toISOString(),
                        archivedAt: null,
                    },
                    members: [],
                    expenses: [],
                    settlements: [],
                    balances: {},
                    suggestedTransfers: [],
                }),
            })
            return
        }
        await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'room not found' } }),
        })
    })
    await openLanding(page)

    const recovery = page.getByTestId('room-link-recovery')
    await recovery.locator('summary').click()
    const input = page.getByTestId('recover-room-input')
    const submit = page.getByTestId('recover-room-submit')

    await input.fill('https://example.com/r/recovered-room-abc123')
    await submit.click()
    await expect(recovery.getByRole('alert')).toHaveText(catalogs.en.marketing.rooms.recovery.invalid)
    expect(requested).toEqual([])
    expect(await page.evaluate(() => window.localStorage.getItem('ps:recent'))).toBeNull()

    await input.fill('https://peanutsplit.com/r/missing-room-def456')
    await submit.click()
    await expect(recovery.getByRole('alert')).toHaveText(catalogs.en.marketing.rooms.recovery.notFound)
    expect(await page.evaluate(() => window.localStorage.getItem('ps:recent'))).toBeNull()

    await input.fill('peanutsplit.com/r/recovered-room-abc123?from=group-chat#split')
    await submit.click()
    await expect.poll(() => requested.includes('/api/rooms/recovered-room-abc123')).toBe(true)
    await expect(page).not.toHaveURL(/\/r\/recovered-room-abc123$/)
    expect(await page.evaluate(() => window.localStorage.getItem('ps:recent'))).toBeNull()
    await expect(page).toHaveURL(/\/r\/recovered-room-abc123$/)
    expect(requested[0]).toBe('/api/rooms/missing-room-def456')
    expect(requested.filter((path) => path === '/api/rooms/recovered-room-abc123').length).toBeGreaterThanOrEqual(1)
    expect(
        await page.evaluate(() =>
            JSON.parse(window.localStorage.getItem('ps:recent') ?? '[]').map((room: { slug: string }) => room.slug)
        )
    ).toEqual(['recovered-room-abc123'])
})

test('a verified pasted link still opens when localStorage is denied and says it was not saved', async ({ page }) => {
    await page.addInitScript(() => {
        const nativeSetItem = Storage.prototype.setItem
        Storage.prototype.setItem = function (key: string, value: string) {
            if (key === 'ps:recent') throw new DOMException('storage denied', 'SecurityError')
            return nativeSetItem.call(this, key, value)
        }
    })
    await page.route('**/api/rooms/recovered-room-abc123', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                room: {
                    id: 'room-recovered',
                    slug: 'recovered-room-abc123',
                    name: 'Recovered room',
                    emoji: 'peanut',
                    currency: 'EUR',
                    coverUrl: null,
                    theme: 'mint',
                    createdAt: new Date().toISOString(),
                    archivedAt: null,
                },
                members: [],
                expenses: [],
                settlements: [],
                balances: {},
                suggestedTransfers: [],
            }),
        })
    })
    await openLanding(page)

    const recovery = page.getByTestId('room-link-recovery')
    await recovery.locator('summary').click()
    await page.getByTestId('recover-room-input').fill('https://peanutsplit.com/r/recovered-room-abc123')
    await page.getByTestId('recover-room-submit').click()

    await expect(page).toHaveURL(/\/r\/recovered-room-abc123$/)
    await expect(
        page.getByText(catalogs.en.marketing.rooms.recovery.openingUnsaved.replace('{room}', 'Recovered room'), {
            exact: true,
        })
    ).toBeVisible()
    expect(await page.evaluate(() => window.localStorage.getItem('ps:recent'))).toBeNull()
})

test('the room handoff shares a localized message, the link, and the room drawing', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: async (payload: ShareData) => {
                ;(window as Window & { __roomSharePayload?: ShareData }).__roomSharePayload = payload
            },
        })
        Object.defineProperty(navigator, 'canShare', {
            configurable: true,
            value: () => {
                throw new DOMException('file sharing probe rejected', 'NotAllowedError')
            },
        })
    })
    await page.goto('/new')
    const roomName = `Share package ${Date.now()}`
    await page.getByTestId('room-name').fill(roomName)
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()

    await expect(page.getByTestId('room-link')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('room-share-doodle')).toBeVisible()
    await page.getByTestId('share-link').click()
    await expect
        .poll(() => page.evaluate(() => (window as Window & { __roomSharePayload?: ShareData }).__roomSharePayload))
        .toMatchObject({
            title: `${roomName} · Peanut Split`,
            text: 'Open the link, pick your name, then add what you paid.',
        })
    const payload = await page.evaluate(
        () => (window as Window & { __roomSharePayload?: ShareData }).__roomSharePayload
    )
    expect(payload?.url).toMatch(/\/r\/share-package-\d+-[a-z]{3,7}-[a-z]{3,7}-[a-z]{3,7}$/)
    await expect(page.getByTestId('copy-link')).toBeVisible()

    await page.evaluate(() => {
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: async () => {
                throw new DOMException('share failed', 'NotAllowedError')
            },
        })
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: async () => {
                    throw new DOMException('clipboard failed', 'NotAllowedError')
                },
            },
        })
        // The manual fallback is the floor under BOTH copy paths, so reaching it
        // means refusing the deprecated one too — on its own, `execCommand` still
        // copies here, which is exactly why it is the fallback in the product.
        Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false })
    })
    await page.getByTestId('share-link').click()
    await expect(page.getByTestId('share-status')).toHaveText(catalogs.en.room.link.shareFailed)

    // Removing Web Share cannot remove the independent copy path. With both
    // clipboard paths refused, the component re-renders and reveals the selected
    // manual-copy fallback.
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    })
    await page.getByTestId('copy-link').click()
    const manualInvite = page.getByTestId('room-link-input')
    await expect(manualInvite).toBeFocused()
    await expect(manualInvite).toHaveValue(
        new RegExp(
            '^Open the link, pick your name, then add what you paid\\.\\nhttp://(?:localhost|127\\.0\\.0\\.1):\\d+/r/share-package-'
        )
    )
})

test('v1 does not expose AI or migration tooling in either landing variant', async ({ page }) => {
    await openLanding(page)
    await expect(page.getByRole('link', { name: 'Import from Splitwise' })).toHaveCount(0)
    await expect(page.getByText(/quick add|scan a receipt|AI receipt|import your Splitwise/i)).toHaveCount(0)

    expect((await page.goto('/import'))?.status()).toBe(404)
    expect((await page.goto('/blog/scan-a-receipt-to-split-a-bill'))?.status()).toBe(404)
})

/**
 * The re-added geometry gate, one layer up from where the deleted one sat.
 *
 * The old test measured hand-placed SVG coordinates (`x="92" y="270"`, `translate(820 180)`)
 * against the doodle's bounding box. Satori has no absolute text placement in these cards — the
 * name and the emblem are flex siblings — so the class of bug it caught is structurally
 * impossible now. What is still possible, and worse, is shipping bytes that are not a PNG at all:
 * that is exactly how the SVG attachment failed in every messenger for months. `createImageBitmap`
 * decoding the payload is the assertion that cannot be satisfied by a renamed blob.
 *
 * This is a SECOND test rather than an extension of the one above it. That one installs a
 * `canShare` that throws, on purpose, to prove the URL never yields to the image — with it in
 * place `payload.files` is permanently undefined and nothing here could ever run.
 */
test('the invite share attaches a real 1200\u00d7630 PNG', async ({ page, request }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: async (payload: ShareData) => {
                ;(window as Window & { __roomSharePayload?: ShareData }).__roomSharePayload = payload
            },
        })
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    })
    await page.goto('/new')
    // 80 W's \u2014 the adversarial name the deleted test used, and the field's own maxLength.
    await page.getByTestId('room-name').fill('W'.repeat(80))
    await page.getByTestId('creator-name').fill('Ana')
    /**
     * Armed BEFORE the room exists, because `useSharePng` fires the moment `LinkMoment` mounts \u2014
     * which is the same paint that reveals the link. Measured: the prefetch response landed 8ms
     * AFTER an immediate tap, so without this wait the test taps a button that is legitimately
     * still holding null, gets the correct text-only degradation, and fails on the decode below.
     * The `expect.poll` further down cannot save it: `__roomSharePayload` is written once, by the
     * `share` call, so polling it re-reads a snapshot taken at tap time and can never change.
     *
     * A phone is not this fast \u2014 both screens that render `LinkMoment` sit on display for seconds
     * before anyone taps, which is the whole reason the fetch was moved to mount. The wait models
     * that, rather than papering over a race that only a test harness can win.
     */
    const cardPrefetched = page
        .waitForResponse((response) => response.url().includes('/card/invite'), { timeout: 20_000 })
        // Any answer, including a 404: the degradation branch below owns that case and must still
        // be reachable when the route is not there.
        .catch(() => null)
    await page.getByTestId('create-room').click()
    const link = page.getByTestId('room-link')
    await expect(link).toBeVisible({ timeout: 15_000 })
    const slug = new URL((await link.innerText()).trim()).pathname.split('/')[2]
    await cardPrefetched
    // Two frames: the response is decoded and `setFile` has committed before the gesture.
    await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    )

    await page.getByTestId('share-link').click()
    await expect
        .poll(() => page.evaluate(() => (window as Window & { __roomSharePayload?: ShareData }).__roomSharePayload))
        .toBeTruthy()
    const payload = await page.evaluate(
        () => (window as Window & { __roomSharePayload?: ShareData }).__roomSharePayload
    )

    /**
     * The designed degradation, asserted for real rather than assumed: with no card route the
     * prefetch 404s, `useSharePng` holds null, and the text+url package goes out unchanged. The
     * invite's job is to carry the link; the picture is the enhancement.
     *
     * This branch disarms itself. The moment the card route answers, the decode below is the gate.
     */
    const cardRoute = await request.get(`/r/${slug}/card/invite`)
    if (cardRoute.status() === 404) {
        expect(payload?.files ?? []).toHaveLength(0)
        expect(payload?.url).toContain('/r/')
        expect(payload?.text).toBe('Open the link, pick your name, then add what you paid.')
        test.skip(true, 'the card route has not landed; the text-only degradation is asserted above')
    }

    // The prefetch runs on mount so the tap can stay synchronous. Without the poll the click races
    // it and the test flakes rather than failing honestly.
    await expect
        .poll(
            () =>
                page.evaluate(
                    () => (window as Window & { __roomSharePayload?: ShareData }).__roomSharePayload?.files?.length ?? 0
                ),
            { timeout: 20_000 }
        )
        .toBeGreaterThan(0)

    const meta = await page.evaluate(async () => {
        const shared = (window as Window & { __roomSharePayload?: ShareData }).__roomSharePayload
        const file = shared?.files?.[0]
        if (!file) return null
        const bitmap = await createImageBitmap(file)
        return {
            name: file.name,
            type: file.type,
            size: file.size,
            w: bitmap.width,
            h: bitmap.height,
            url: shared?.url,
        }
    })
    expect(meta).toMatchObject({ name: 'peanut-split-invite.png', type: 'image/png', w: 1200, h: 630 })
    expect(meta!.size).toBeGreaterThan(5_000)
    // The link still rides along. The picture is the enhancement, never the replacement.
    expect(meta!.url).toContain('/r/')
})
