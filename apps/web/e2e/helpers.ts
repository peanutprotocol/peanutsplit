import { expect, type Page } from '@playwright/test'

/**
 * Finish the shared creation boundary without depending on whichever action the
 * room offers next. Tests that need initial roster names add them at the visible
 * checkpoint before calling this helper.
 */
export async function enterCreatedRoom(page: Page): Promise<string> {
    await expect(page.getByTestId('roster-checkpoint')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()
    await page.waitForURL(/\/r\/[^/?]+/)
    await expect(page.getByTestId('open-room-settings')).toBeVisible({ timeout: 15_000 })
    return page.url()
}
