import { expect, type Locator, type Page } from '@playwright/test'

/** Drag from the centre of the handle through a share of its available travel. */
export async function slideToConfirm(page: Page, control: Locator, progress = 1): Promise<void> {
    await control.scrollIntoViewIfNeeded()
    const trackBox = await control.boundingBox()
    if (!trackBox) throw new Error('slide-to-confirm control has no bounding box')

    const handleCenter = 26
    const travel = Math.max(0, trackBox.width - 52)
    const startX = trackBox.x + handleCenter
    const y = trackBox.y + trackBox.height / 2
    const endX = startX + travel * progress

    await page.mouse.move(startX, y)
    await page.mouse.down()
    await page.mouse.move(endX, y, { steps: 8 })
    await page.mouse.up()
}

/** Wait for both React state and the visible snap-back transition to reset. */
export async function expectSlideReset(control: Locator): Promise<void> {
    await expect(control).toHaveAttribute('data-progress', '0')
    await expect
        .poll(async () => {
            const [track, handle] = await Promise.all([
                control.boundingBox(),
                control.locator('[data-slide-handle]').boundingBox(),
            ])
            return track && handle ? Math.abs(handle.x - track.x - 4) : Number.POSITIVE_INFINITY
        })
        .toBeLessThan(3)
}
