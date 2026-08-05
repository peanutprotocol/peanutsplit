import { expect, type Locator, type Page } from '@playwright/test'
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

const focusShape = (control: Locator) =>
    control.evaluate((element) => {
        const style = getComputedStyle(element)
        return [
            style.outlineColor,
            style.outlineStyle,
            style.outlineWidth,
            style.outlineOffset,
            style.borderTopLeftRadius,
            style.borderTopRightRadius,
            style.borderBottomRightRadius,
            style.borderBottomLeftRadius,
        ]
    })

test.beforeEach(async ({ page }) => {
    await page.goto('/new')
    await page.getByTestId('room-name').fill('Focus behaviour')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await enterCreatedRoom(page)
})

test('focus enters the sheet, stays inside it, and comes back to the trigger', async ({ page }) => {
    // A second retained room exposes both independently focusable halves of a
    // compound picker row without another API write in this rate-limited suite.
    await page.evaluate(() => {
        const retained = JSON.parse(localStorage.getItem('ps:recent') ?? '[]')
        localStorage.setItem(
            'ps:recent',
            JSON.stringify([
                ...retained,
                {
                    slug: 'focus-neighbour-brave-otter-lamp',
                    name: 'Focus neighbour',
                    emoji: 'island',
                    theme: 'mint',
                    lastSeenAt: Date.now() - 1_000,
                },
            ])
        )
    })

    // Open both steps the way a keyboard user does. Clicking would move focus by
    // itself and hide the bug.
    await page.getByTestId('open-room-switcher').focus()
    await page.keyboard.press('Enter')
    const switcher = page.getByTestId('room-switcher-sheet')
    await expect(switcher).toBeVisible({ timeout: 10_000 })
    const settingsTrigger = switcher.locator('[data-testid="room-switcher-settings"][data-current="true"]')

    const recentRoom = switcher.locator(
        '[data-testid="room-switcher-tile"][data-slug="focus-neighbour-brave-otter-lamp"]'
    )
    await recentRoom.focus()
    await expect
        .poll(() => focusShape(recentRoom))
        .toEqual(['rgb(33, 28, 23)', 'solid', '2px', '-2px', '12px', '0px', '0px', '12px'])

    const recentSettings = switcher.locator(
        '[data-testid="room-switcher-settings"][data-slug="focus-neighbour-brave-otter-lamp"]'
    )
    await recentSettings.focus()
    await expect
        .poll(() => focusShape(recentSettings))
        .toEqual(['rgb(33, 28, 23)', 'solid', '2px', '-2px', '0px', '12px', '12px', '0px'])

    await settingsTrigger.focus()
    await expect
        .poll(() => focusShape(settingsTrigger))
        .toEqual(['rgb(33, 28, 23)', 'solid', '2px', '-2px', '0px', '12px', '12px', '0px'])
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

    // Back restores the picker history entry and the exact action that opened
    // Settings. The ordinary title-opened picker restoration is covered below.
    await page.goBack()
    await expect(page.getByTestId('settings-sheet')).toBeHidden({ timeout: 10_000 })
    await expect(switcher).toBeVisible({ timeout: 10_000 })
    await expect(settingsTrigger).toBeFocused()
    expect((await activeElement(page)).insideDialog).toBe(true)
})

test('the header emblem opens Settings directly and X restores focus to it', async ({ page }) => {
    const settingsTrigger = page.getByTestId('open-room-settings')
    await expect(settingsTrigger.getByTestId('room-header-emblem')).toHaveCount(1)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Tab')
    await expect(settingsTrigger).toBeFocused()
    await expect
        .poll(() => focusShape(settingsTrigger))
        .toEqual(['rgb(33, 28, 23)', 'solid', '2px', '2px', '12px', '12px', '12px', '12px'])
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(600)

    await page.getByTestId('close-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toBeHidden({ timeout: 10_000 })

    expect(await activeElement(page)).toMatchObject({ testid: 'open-room-settings', insideDialog: false })
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
