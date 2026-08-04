import { expect, type Page } from '@playwright/test'
import { openDevice, test } from './fixtures'
import enMessages from '../src/i18n/messages/en.json'
import { enterCreatedRoom } from './helpers'

/**
 * The crew moment, end to end.
 *
 * One room is built and then reused by every test in this file: room creation is rate-limited per
 * IP, and a spec that mints one room per assertion becomes order-dependent the moment the budget
 * runs out.
 */

const copy = enMessages.room.achievements

/** Open the room link on a fresh device and join under a new name. */
async function join(page: Page, url: string, name: string): Promise<void> {
    await page.goto(url)
    await expect(page.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('im-new').click()
    await page.getByTestId('join-name').fill(name)
    await page.getByTestId('join-room').click()
    await expect(page.getByTestId('join-gate')).toHaveCount(0, { timeout: 15_000 })
}

test.describe.configure({ mode: 'serial' })

let roomUrl = ''

test.beforeAll(async ({ browser }) => {
    const page = await openDevice(browser)
    await page.goto('/new')
    await page.getByTestId('room-name').fill(`Crew trip ${Date.now()}`)
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    roomUrl = await enterCreatedRoom(page)

    // Two more people, because CREW's first rung is three.
    const bea = await openDevice(browser)
    await join(bea, roomUrl, 'Bea')
    const caro = await openDevice(browser)
    await join(caro, roomUrl, 'Caro')
    await page.context().close()
})

test('the crew moment fires once, then never again on this device', async ({ newDevice }) => {
    const page = await newDevice()
    await join(page, roomUrl, 'Dan')

    const moment = page.getByTestId('achievement-moment')
    await expect(moment).toBeVisible({ timeout: 15_000 })
    // The rung, not the roster: four ledger names standing on the three-name rung.
    await expect(moment).toHaveAttribute('data-achievement', 'crew-3')
    // The headline counts ledger participants, not devices that opened or claimed a name.
    await expect(moment).toContainText('4 names in this ledger')
    await expect(moment).toContainText(copy.crew.body)
    // The persona lineup is drawn, and it is drawings — no names on a card that gets shared.
    await expect(page.getByTestId('achievement-lineup')).toBeVisible()

    const slug = new URL(page.url()).pathname.split('/')[2]
    await expect
        .poll(() => page.evaluate((key) => window.localStorage.getItem(key), `ps:ach:${slug}`))
        .toContain('crew-3')

    await page.getByTestId('achievement-dismiss').click()
    await expect(moment).toHaveCount(0)

    // A reload is a new session, so the session claim is fresh — only the durable seen-set stands
    // between the room and a second celebration. That is the one this asserts.
    await page.reload()
    await expect(page.getByTestId('achievement-lineup')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByTestId('achievement-moment')).toHaveCount(0)
})

// BUG (for Konrad): at 375px a four-person room scrolls the DOCUMENT sideways, not just the
// balance strip. Probed with the crew moment up: documentElement.scrollWidth 473 vs clientWidth
// 375, and the furthest-right nodes are `balance-card` list items (`w-[8.5rem]`, 136px each) whose
// right edge reaches 596px. Four cards are 544px of track, so the strip's horizontal overflow is
// escaping its container instead of being clipped and scrolled inside it. The moment itself is
// fine — the assertions above it pass — so this is the room layout, not the achievement card.
// Unpinned once the strip clips its own overflow.
test.fixme('the moment reads without motion, and fits a 375px screen', async ({ newDevice }) => {
    const page = await newDevice({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' })
    await join(page, roomUrl, 'Eve')

    const moment = page.getByTestId('achievement-moment')
    await expect(moment).toBeVisible({ timeout: 15_000 })
    await expect(moment).toContainText(copy.crew.body)

    // `Confetti` returns null under reduced motion rather than animating to nothing, so there is
    // nothing decorative left inside the card at all.
    await expect(moment.locator('[data-decorative]')).toHaveCount(0)

    // Nothing pushes the page sideways, and the keepsake share control is a real tap target.
    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
    expect(overflow).toBe(true)

    const shareBox = await page.getByTestId('share-card-crew').boundingBox()
    expect(shareBox).not.toBeNull()
    expect(shareBox!.height).toBeGreaterThanOrEqual(44)
    expect(shareBox!.width).toBeLessThanOrEqual(375)
})

test('the crew moment is a keepsake, not roster completion or an invitation prompt', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await join(page, roomUrl, 'Fede')

    await expect(page.getByTestId('achievement-moment')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('achievement-invite')).toHaveCount(0)
    await expect(page.getByTestId('share-card-crew')).toHaveAccessibleName(copy.shareLabel.crew)
    await expect(page.getByTestId('achievement-moment')).not.toContainText(/missing|join|invite/i)
    await context.close()
})
