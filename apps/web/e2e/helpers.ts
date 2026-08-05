import { expect, type Locator, type Page } from '@playwright/test'

/**
 * The balance card that is ABOUT `member`, which is not always the person holding the phone.
 *
 * Three or more people get one card each. TWO people get ONE pair card, and `pairCard` in
 * `BalanceStrip.tsx` makes it about the COUNTERPARTY: balances sum to zero, so the viewer's own
 * card would be the other one negated, and a reader adding both sees twice the real debt.
 */
export const balanceCard = (page: Page, member: string): Locator =>
    page.locator(`[data-testid="balance-card"][data-member="${member}"]`)

/**
 * Assert a member's net in minor units, off `data-net` — raw server truth rather than rendered
 * text, so no assertion catches a NumberFlow frame mid-animation.
 *
 * The card is proven to EXIST before its value is read. Without that step a spec that names the
 * wrong member — the viewer instead of the counterparty in a two-person room, which is the easy
 * mistake — spends the full timeout inside `toHaveAttribute` and reports "element(s) not found",
 * which reads like a timing problem and is not one. That misdiagnosis is what this split buys:
 * the guard names the convention that was broken, and it fails in seconds instead of fifteen.
 */
export async function expectBalance(page: Page, member: string, netMinor: string): Promise<void> {
    await expect(
        balanceCard(page, member),
        `no balance card is about "${member}". A two-person room states the one fact once, on the ` +
            `COUNTERPARTY's card — assert the viewer's own net as its negation on the other name.`
    ).toBeAttached({ timeout: 15_000 })
    await expect(balanceCard(page, member)).toHaveAttribute('data-net', netMinor, { timeout: 15_000 })
}

/**
 * Finish the shared creation boundary without depending on whichever action the
 * room offers next. Tests that need initial roster names add them at the visible
 * checkpoint before calling this helper.
 */
export async function enterCreatedRoom(page: Page): Promise<string> {
    await expect(page.getByTestId('roster-checkpoint')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()
    await page.waitForURL(/\/r\/[^/?]+/)
    await expect(page.getByTestId('open-room-switcher')).toBeVisible({ timeout: 15_000 })
    return page.url()
}

/** Open Settings for the loaded room through its room-picker action. */
export async function openCurrentRoomSettings(page: Page): Promise<void> {
    await page.getByTestId('open-room-switcher').click()
    const switcher = page.getByTestId('room-switcher-sheet')
    await expect(switcher).toBeVisible({ timeout: 10_000 })

    const settings = switcher.locator('[data-testid="room-switcher-settings"][data-current="true"]')
    await expect(settings).toHaveCount(1)
    await settings.click()
    await expect(page.getByTestId('settings-sheet')).toBeVisible({ timeout: 10_000 })
}
