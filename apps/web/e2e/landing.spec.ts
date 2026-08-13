import { expect, type Locator, type Page } from '@playwright/test'
import { test } from './fixtures'
import enMessages from '../src/i18n/messages/en.json'
import esMessages from '../src/i18n/messages/es-419.json'
import ptBRMessages from '../src/i18n/messages/pt-br.json'
import { HREFLANG } from '../src/i18n/locales'
import { SPLIT_CONTENT_INDEX_RELEASED_PATHS } from '../src/lib/split-content/index-release'
import { enterCreatedRoom } from './helpers'
import { slideToConfirm } from './slide-to-confirm'

const controlBuild = process.env.NEXT_PUBLIC_LANDING_VARIANT === 'control'

// These tests mock and delay browser room requests. A production Serwist worker
// would own those requests before Playwright routing can observe them; worker
// behavior has its dedicated coverage in pwa.spec.ts.
test.use({ serviceWorkers: 'block' })

type Locale = 'en' | 'es-419' | 'pt-br'
type LandingMessages = {
    marketing: {
        hero: {
            titleAccessible: string
            stageSummary: string
            cta: string
        }
        proof: {
            linkIdentity: { title: string }
            everyoneAdds: { title: string }
            suggestedPlan: { title: string }
            examples: { title: string }
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
        link: {
            shareFailed: string
        }
    }
}

const catalogs: Record<Locale, LandingMessages> = {
    en: enMessages as unknown as LandingMessages,
    'es-419': esMessages as unknown as LandingMessages,
    'pt-br': ptBRMessages as unknown as LandingMessages,
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
    // `lang` is the BCP 47 spelling, not the locale code: `pt-br` is the cookie value, the
    // filename and the URL segment, while the markup declares `pt-BR`. `HREFLANG` is the one
    // map that holds the difference, so read it rather than restating either spelling here.
    await expect(page.locator('html')).toHaveAttribute('lang', HREFLANG[locale])
}

async function openApp(page: Page, locale: Locale = 'en', path = '/app') {
    await page.goto(path)
    await page.context().addCookies([{ name: 'ps-locale', value: locale, url: page.url() }])
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', HREFLANG[locale])
}

test('creation-labelled marketing links bypass the noindex operational home', async ({ page }) => {
    await openLanding(page)

    await expect(page.getByTestId('marketing-home')).toBeVisible()
    await expect(page.getByTestId('landing-proof')).toBeVisible()
    await expect(page.getByTestId('read-more')).toBeVisible()
    await expect(page.locator('footer')).toBeVisible()
    await expect(page.getByTestId('app-home')).toHaveCount(0)
    await expect(page.getByTestId('hero-room-name')).toHaveCount(0)
    await expect(page.getByTestId('hero-create-room')).toHaveCount(0)
    await expect(page.getByTestId('room-link-recovery')).toHaveCount(0)

    const creationHandoffs = page.locator(
        '[data-testid="landing-app-link"], [data-testid="pass-link-chat-link"], [data-testid^="proof-"][data-testid$="-link"], [data-testid="room-example-link"], [data-testid="final-cta-link"]'
    )
    await expect(creationHandoffs).toHaveCount(controlBuild ? 9 : 10)
    for (const handoff of await creationHandoffs.all()) await expect(handoff).toHaveAttribute('href', '/new')
    await expect(
        page.locator('footer').getByRole('link', { name: catalogs.en.marketing.footer.createSplit })
    ).toHaveAttribute('href', '/new')

    await page.getByTestId('landing-app-link').click()
    await expect(page).toHaveURL('/new')
    await expect(page.getByTestId('room-composer')).toBeVisible()
    await expect(page.getByTestId('app-home')).toHaveCount(0)

    await openApp(page)
    await expect(page.getByTestId('app-home')).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/app$/)
    await expect(page.getByTestId('app-new-split')).toHaveAttribute('href', '/new')
    await expect(page.getByTestId('app-import')).toHaveAttribute('href', '/import')
    await expect(page.getByTestId('room-link-recovery')).toBeVisible()
    await expect(page.getByTestId('marketing-home')).toHaveCount(0)
    await expect(page.getByTestId('landing-proof')).toHaveCount(0)
    await expect(page.getByTestId('read-more')).toHaveCount(0)
    await expect(page.locator('footer')).toHaveCount(0)
})

test('supporting marketing surfaces route every creation-labelled link to the composer', async ({ page }) => {
    for (const path of ['/blog', '/tools', '/splitwise-alternative', '/import', '/blog/split-bills-without-an-app']) {
        await page.goto(path)
        const creationLinks = page.getByRole('link', { name: /Start (?:a split|a room)/i })
        expect(await creationLinks.count(), `${path} should expose at least one creation link`).toBeGreaterThan(0)
        for (const link of await creationLinks.all()) await expect(link).toHaveAttribute('href', '/new')
    }
})

const RELEASED_GUIDE_PATHS: readonly string[] = SPLIT_CONTENT_INDEX_RELEASED_PATHS
const PARKED_GUIDE_SLUGS = ['guides/split-a-group-trip-across-countries', 'guides/split-expenses-across-currencies']

const hubPath = (locale: Locale) => (locale === 'en' ? '/blog' : `/${locale}/blog`)
const releasedGuidesIn = (locale: Locale) =>
    RELEASED_GUIDE_PATHS.filter((path) =>
        locale === 'en' ? path.startsWith('/guides/') : path.startsWith(`/${locale}/`)
    )

/**
 * Until this shipped nothing on the site linked a generated guide and the sitemap was their only
 * way in. The webServer boots WITHOUT `SEO_INDEXABLE`, which is the point of the assertion: a
 * listing derived from the runtime flag would be empty here and full only in production, where
 * nobody could check it first.
 */
test('the content hub lists exactly the released guides for its own language', async ({ page }) => {
    for (const locale of ['en', 'es-419', 'pt-br'] as const) {
        const hub = hubPath(locale)
        await page.goto(hub)

        const hrefs = await page
            .locator('a[href*="/guides/"]')
            .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
        expect([...new Set(hrefs)].sort(), hub).toEqual([...releasedGuidesIn(locale)].sort())

        // Covers the ItemList JSON-LD as well as the markup — a parked guide must not be
        // advertised anywhere on a hub, and both places are built from the same list.
        const html = await page.content()
        for (const slug of PARKED_GUIDE_SLUGS) expect(html, `${hub} ${slug}`).not.toContain(slug)
    }
})

test('an installed app never strands an old root launcher at the marketing page', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    })

    await page.goto('/')
    await expect(page).toHaveURL('/app')
    await expect(page.getByTestId('app-home')).toBeVisible()
    await expect(page.getByTestId('marketing-home')).toHaveCount(0)
})

test('landing keeps the detailed FAQ and selected team portraits', async ({ page }) => {
    await openLanding(page)

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
                    slug: `room-${index}-brave-otter-lamp`,
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
                    slug: `room-${index}-brave-otter-lamp`,
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

test('both landing variants point creation intent at the room composer without embedding it', async ({ page }) => {
    await openLanding(page)

    await expect(page.getByTestId('landing-hero-variant')).toHaveAttribute(
        'data-variant',
        controlBuild ? 'control' : 'pass_link'
    )
    await expect(page.getByTestId('pass-link-hero')).toHaveCount(controlBuild ? 0 : 1)
    await expect(page.getByTestId('landing-app-link')).toHaveAttribute('href', '/new')
    await expect(page.getByTestId('hero-room-name')).toHaveCount(0)
    await expect(page.getByTestId('hero-creator-name')).toHaveCount(0)
    await expect(page.getByTestId('hero-create-room')).toHaveCount(0)
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
            const appLink = page.getByTestId('landing-app-link')
            const chatFrame = page.getByTestId('pass-link-chat-frame')

            await expect(hero).toBeVisible()
            await expect(headline).toBeVisible()
            await expect(stage).toBeVisible()
            await expect(appLink).toBeVisible()
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
            await expectNoOverlap(stage, appLink)
            await expectNoOverlap(headline, appLink)

            if (
                (viewport.width === 390 && [720, 844].includes(viewport.height)) ||
                (viewport.width === 1440 && viewport.height === 900)
            ) {
                for (const [label, locator] of [
                    ['headline', headline],
                    ['creation handoff', appLink],
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

    test('the right-hand messenger mockup opens the room composer', async ({ page }) => {
        await openLanding(page)
        await page.getByTestId('pass-link-chat-link').click()
        await expect(page).toHaveURL('/new')
        await expect(page.getByTestId('room-composer')).toBeVisible()
    })

    test('the creation handoff remains keyboard-operable and touch-sized on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await openLanding(page)

        const appLink = page.getByTestId('landing-app-link')
        await appLink.focus()
        await expect(appLink).toBeFocused()
        const box = await appLink.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.height).toBeGreaterThanOrEqual(44)
        expect(box!.width).toBeGreaterThanOrEqual(44)
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL('/new')
    })

    test('handoff interaction settles the one-shot story and the final state holds', async ({ page }) => {
        await openLanding(page)
        const stage = page.getByTestId('pass-link-stage')
        await expect(stage).toHaveAttribute('data-state', /question|reply|link|complete/)

        await page.getByTestId('landing-app-link').focus()
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
        newDevice,
    }, testInfo) => {
        const baseURL = testInfo.project.use.baseURL
        if (typeof baseURL !== 'string') throw new Error('Playwright baseURL is required')
        const noJs = await newDevice({ javaScriptEnabled: false, reducedMotion: 'reduce' })

        await noJs.goto(new URL('/', baseURL).href)
        await expect(noJs.getByTestId('proof-link-identity')).toBeVisible()
        await expect(noJs.getByTestId('proof-link-identity')).toHaveCSS('opacity', '1')
        await expect(noJs.getByTestId('proof-link-identity')).toHaveCSS('transform', 'none')

        await noJs.goto(new URL('/new', baseURL).href)
        const creationSurface = noJs.locator('[data-motion-surface]').first()
        await expect(noJs.getByTestId('room-composer')).toBeVisible()
        await expect(creationSurface).toHaveCSS('opacity', '1')
        await expect(creationSurface).toHaveCSS('transform', 'none')
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

    test('landing creation links open the composer without writing a room', async ({ page }) => {
        const roomWrites: string[] = []
        page.on('request', (request) => {
            const url = new URL(request.url())
            if (request.method() === 'POST' && url.pathname === '/api/rooms') roomWrites.push(request.url())
        })
        await openLanding(page)
        await expect(page.getByTestId('hero-room-name')).toHaveCount(0)
        await page.getByTestId('landing-app-link').click()
        await expect(page).toHaveURL('/new')
        await expect(page.getByTestId('room-composer')).toBeVisible()
        expect(roomWrites).toEqual([])
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

    test('a room example opens the composer from the keyboard without creating a room', async ({ page }) => {
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

    for (const locale of ['en', 'es-419', 'pt-br'] as const) {
        test(`${locale} localizes the headline, summary, CTA, and proof scenes`, async ({ page }) => {
            await page.setViewportSize({ width: 360, height: 740 })
            await openLanding(page, locale)
            const messages = catalogs[locale].marketing

            await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.hero.titleAccessible)
            await expect(page.getByTestId('pass-link-stage-summary')).toHaveText(messages.hero.stageSummary)
            await expect(page.getByTestId('landing-app-link')).toContainText(messages.hero.cta)

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

    test('zoom, selection, and a shrunken visual viewport keep the creation handoff reachable', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await openLanding(page)

        const viewportContent = await page.locator('meta[name="viewport"]').getAttribute('content')
        expect(viewportContent ?? '').not.toMatch(/user-scalable\s*=\s*no/i)
        expect(viewportContent ?? '').not.toMatch(/maximum-scale\s*=\s*1(?:[,\\s]|$)/i)
        expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).not.toBe('none')

        const appLink = page.getByTestId('landing-app-link')
        await appLink.focus()
        await page.setViewportSize({ width: 390, height: 500 })
        await appLink.evaluate((element) => element.scrollIntoView({ block: 'nearest' }))
        const appLinkBox = await appLink.boundingBox()
        expect(appLinkBox).not.toBeNull()
        expect(appLinkBox!.y).toBeGreaterThanOrEqual(0)
        expect(appLinkBox!.y + appLinkBox!.height).toBeLessThanOrEqual(500)
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
    await openApp(page, 'en', '/app?manage=1')

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
    const confirmForget = page.getByTestId('confirm-forget-room')
    // A plain tap on the track cannot remove the only locally saved link.
    await confirmForget.click()
    await expect(page.getByTestId('forget-room-confirm')).toBeVisible()
    await expect(list.locator('a')).toHaveCount(7)
    await slideToConfirm(page, confirmForget)
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
    request,
}) => {
    const created = await request.post('/api/rooms', {
        data: { name: 'Recovered room', currency: 'EUR', creatorName: 'Ana' },
    })
    expect(created.status()).toBe(201)
    const recovered = (await created.json()) as { room: { slug: string } }
    const recoveredPath = `/api/rooms/${recovered.room.slug}`
    const requested: string[] = []
    await page.route('**/api/rooms/*', async (route) => {
        const path = new URL(route.request().url()).pathname
        requested.push(path)
        if (path === recoveredPath) {
            // A real verification is asynchronous. Holding the 200 briefly lets
            // the test prove that neither persistence nor navigation happens
            // merely because the pasted string looked like a room URL.
            await new Promise((resolve) => setTimeout(resolve, 250))
            await route.continue()
            return
        }
        await route.continue()
    })
    await openApp(page)

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

    await input.fill(`peanutsplit.com/r/${recovered.room.slug}?from=group-chat#split`)
    await submit.click()
    await expect.poll(() => requested.includes(recoveredPath)).toBe(true)
    await expect(page).not.toHaveURL(new RegExp(`/r/${recovered.room.slug}$`))
    expect(await page.evaluate(() => window.localStorage.getItem('ps:recent'))).toBeNull()
    await expect(page).toHaveURL(new RegExp(`/r/${recovered.room.slug}$`))
    expect(requested[0]).toBe('/api/rooms/missing-room-def456')
    expect(requested.filter((path) => path === recoveredPath).length).toBeGreaterThanOrEqual(1)
    expect(
        await page.evaluate(() =>
            JSON.parse(window.localStorage.getItem('ps:recent') ?? '[]').map((room: { slug: string }) => room.slug)
        )
    ).toEqual([recovered.room.slug])
})

test('a verified pasted link still opens when localStorage is denied and says it was not saved', async ({
    page,
    request,
}) => {
    const created = await request.post('/api/rooms', {
        data: { name: 'Recovered room', currency: 'EUR', creatorName: 'Ana' },
    })
    expect(created.status()).toBe(201)
    const recovered = (await created.json()) as { room: { slug: string } }
    await page.addInitScript(() => {
        const nativeSetItem = Storage.prototype.setItem
        Storage.prototype.setItem = function (key: string, value: string) {
            if (key === 'ps:recent') throw new DOMException('storage denied', 'SecurityError')
            return nativeSetItem.call(this, key, value)
        }
    })
    await openApp(page)

    const recovery = page.getByTestId('room-link-recovery')
    await recovery.locator('summary').click()
    await page.getByTestId('recover-room-input').fill(`https://peanutsplit.com/r/${recovered.room.slug}`)
    await page.getByTestId('recover-room-submit').click()

    await expect(page).toHaveURL(new RegExp(`/r/${recovered.room.slug}$`))
    await expect(
        page.getByText(catalogs.en.marketing.rooms.recovery.openingUnsaved.replace('{room}', 'Recovered room'), {
            exact: true,
        })
    ).toBeVisible()
    expect(await page.evaluate(() => window.localStorage.getItem('ps:recent'))).toBeNull()
})

test('the room handoff shares localized text and the exact URL without attaching a file', async ({ page }) => {
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
    await enterCreatedRoom(page)
    await page.getByTestId('empty-share').click()

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
    if (typeof payload?.url !== 'string') throw new Error('The room share payload must include its URL')
    expect(payload.url).toMatch(/\/r\/share-package-\d+-[A-Za-z0-9_-]{22}$/)
    expect(Object.keys(payload ?? {})).toEqual(['title', 'text', 'url'])
    expect(payload).not.toHaveProperty('files')
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
    await expect(manualInvite).toHaveValue(`Open the link, pick your name, then add what you paid.\n${payload.url}`)
})

test('v1 exposes Splitwise import without exposing AI tooling', async ({ page }) => {
    await openLanding(page)
    await expect(page.getByRole('link', { name: 'Import from Splitwise' })).toBeVisible()
    await expect(page.getByText(/scan a receipt|AI receipt/i)).toHaveCount(0)

    expect((await page.goto('/import'))?.status()).toBe(200)
    expect((await page.goto('/blog/scan-a-receipt-to-split-a-bill'))?.status()).toBe(404)
})

test('the room URL prewarms a cached 1200×630 social preview while native share stays URL-only', async ({ page }) => {
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
                ;(window as Window & { __canShareCalls?: number }).__canShareCalls =
                    ((window as Window & { __canShareCalls?: number }).__canShareCalls ?? 0) + 1
                return true
            },
        })
    })
    await page.goto('/new')
    // The field's full 80-character bound still has to produce a decodable image.
    await page.getByTestId('room-name').fill('W'.repeat(80))
    await page.getByTestId('creator-name').fill('Ana')
    const previewWarmed = page.waitForResponse((response) => response.url().includes('/opengraph-image'), {
        timeout: 20_000,
    })
    await page.getByTestId('create-room').click()
    const roomUrl = await enterCreatedRoom(page)
    const slug = new URL(roomUrl).pathname.split('/')[2]
    // What the room actually tells a crawler to fetch. Next mints this URL —
    // a build-scoped hash on the segment, plus a cache-busting query — so the
    // test reads it out of the head exactly like the app does, and matches its
    // SHAPE, never today's hash. The bug this guards: the app spelled the URL
    // out as `/r/<slug>/opengraph-image`, which Next does not serve, so every
    // shared room unfurled imageless off a 404.
    const advertised = page.locator('meta[property="og:image"]')
    await expect(advertised).toHaveAttribute(
        'content',
        new RegExp(`^https?://[^/]+/r/${slug}/opengraph-image-[a-z0-9]+(\\?|$)`)
    )
    const previewUrl = (await advertised.getAttribute('content'))!

    const previewResponse = await previewWarmed
    expect(previewResponse.status()).toBe(200)
    // The warm is the advertised URL, not a near-miss of it.
    expect(previewResponse.url()).toBe(previewUrl)
    expect(previewResponse.headers()['cache-control']).toContain('s-maxage=300')
    expect(previewResponse.headers()['cache-control']).toContain('stale-while-revalidate=60')

    const preview = await page.evaluate(async (url) => {
        const response = await fetch(url)
        const blob = await response.blob()
        const bitmap = await createImageBitmap(blob)
        return { ok: response.ok, type: blob.type, width: bitmap.width, height: bitmap.height }
    }, previewUrl)
    expect(preview).toEqual({ ok: true, type: 'image/png', width: 1200, height: 630 })

    await page.getByTestId('empty-share').click()
    await expect(page.getByTestId('room-link')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('share-link').click()
    await expect
        .poll(() => page.evaluate(() => (window as Window & { __roomSharePayload?: ShareData }).__roomSharePayload))
        .toBeTruthy()
    const payload = await page.evaluate(
        () => (window as Window & { __roomSharePayload?: ShareData }).__roomSharePayload
    )
    expect(payload?.url).toBe(roomUrl)
    expect(Object.keys(payload ?? {})).toEqual(['title', 'text', 'url'])
    expect(payload).not.toHaveProperty('files')
    expect(await page.evaluate(() => (window as Window & { __canShareCalls?: number }).__canShareCalls ?? 0)).toBe(0)
})
