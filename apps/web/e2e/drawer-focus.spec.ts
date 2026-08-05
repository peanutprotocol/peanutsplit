import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'
import { enterCreatedRoom, openCurrentRoomSettings } from './helpers'

/**
 * The shared drawer primitive is modal for the keyboard, not only for the mouse.
 *
 * It was not, and the reason is worth keeping written down: vaul defaults `autoFocus` to false,
 * which cancels Radix's mount-autofocus, and Radix's focus trap only re-focuses an element it has
 * already seen inside the dialog. So the trap was armed and never triggered — Tab walked straight
 * out of an open sheet into the page behind it, and two tabs plus Enter stacked a second dialog on
 * the first. `pointer-events: none` on the body hid all of this from a mouse.
 *
 * Every drawer in the room shares this primitive, so these assertions cover settings, share,
 * settle, expense and the character sheet at once.
 */

const activeElement = (page: Page) =>
    page.evaluate(() => ({
        testid: (document.activeElement as HTMLElement | null)?.dataset?.testid ?? null,
        insideDialog: !!document.activeElement?.closest('[role="dialog"],[data-vaul-drawer]'),
    }))

test.beforeEach(async ({ page }) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Focus behaviour')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await enterCreatedRoom(page)
})

test('focus enters the sheet, stays inside it, and comes back to the trigger', async ({ page }) => {
    // Open both steps the way a keyboard user does. Clicking would move focus by
    // itself and hide the bug.
    await page.getByTestId('open-room-switcher').focus()
    await page.keyboard.press('Enter')
    const switcher = page.getByTestId('room-switcher-sheet')
    await expect(switcher).toBeVisible({ timeout: 10_000 })
    const settingsTrigger = switcher.locator('[data-testid="room-switcher-settings"][data-current="true"]')
    await settingsTrigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(600)

    expect(await activeElement(page)).toMatchObject({ insideDialog: true })

    await page.keyboard.press('Tab')
    expect((await activeElement(page)).insideDialog).toBe(true)
    await page.keyboard.press('Tab')
    expect((await activeElement(page)).insideDialog).toBe(true)

    // `inert` and `aria-hidden` must not both ship: browsers and screen readers disagree about a
    // subtree that is hidden from the accessibility tree but still reachable by Tab.
    const background = await page.evaluate(() => {
        const main = document.querySelector('main')
        return { ariaHidden: main?.getAttribute('aria-hidden') ?? null, inert: main?.hasAttribute('inert') ?? false }
    })
    expect(background).toEqual({ ariaHidden: null, inert: true })

    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    expect(await activeElement(page)).toMatchObject({ testid: 'open-room-switcher', insideDialog: false })
})

test('closing Settings with X returns focus to the stable title trigger', async ({ page }) => {
    await openCurrentRoomSettings(page)
    await page.waitForTimeout(600)

    await page.getByTestId('close-room-settings').click()
    await page.waitForTimeout(800)

    // The room-specific opener leaves the DOM when its picker closes, so focus
    // returns to the stable title control rather than <body>.
    expect(await activeElement(page)).toMatchObject({ testid: 'open-room-switcher' })
})

test('the title switcher traps focus and restores it to the title trigger', async ({ page }) => {
    const trigger = page.getByTestId('open-room-switcher')
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('room-switcher-sheet')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(600)

    expect(await activeElement(page)).toMatchObject({ insideDialog: true })
    await page.keyboard.press('Tab')
    expect((await activeElement(page)).insideDialog).toBe(true)
    await page.keyboard.press('Tab')
    expect((await activeElement(page)).insideDialog).toBe(true)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    expect(await activeElement(page)).toMatchObject({ testid: 'open-room-switcher', insideDialog: false })
})

test('the sheet leaves a tappable strip of room above it', async ({ page }) => {
    await openCurrentRoomSettings(page)
    await page.waitForTimeout(600)

    // At `max-h-dvh` the sheet filled a 390x844 phone exactly, so tap-outside-to-close could never
    // fire on the design target even though it worked on desktop.
    const overlayAtTop = await page.evaluate(() => {
        const element = document.elementFromPoint(Math.round(window.innerWidth / 2), 8)
        return !element?.closest('[data-vaul-drawer]')
    })
    expect(overlayAtTop).toBe(true)
})
