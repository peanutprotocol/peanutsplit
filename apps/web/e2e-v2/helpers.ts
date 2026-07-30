import { expect, type Page } from '@playwright/test'

/**
 * What `scan.spec.ts` and `share-target.spec.ts` both need: a real image, a stubbed model, a quiet
 * install banner and a room to work in. Extracted the day the share target arrived — two entry
 * points into the same scan flow should not carry two copies of the way in.
 */

/** 8×12 white JPEG. Small enough to inline, real enough for `createImageBitmap` and the canvas
 *  downscale in `scan-image.ts` to be exercised for real. */
export const TINY_JPEG = Buffer.from(
    '/9j/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAMAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKcAD//Z',
    'base64'
)

/** What the model "read": two real lines and one hallucinated footer. The third is the row the
 *  scan review exists to let somebody delete. */
export const PARSED = {
    items: [
        { label: 'Pizza', amountMinor: '1250', quantity: 1 },
        { label: 'Wine', amountMinor: '2000', quantity: 1 },
        { label: 'LOYALTY CARD 4417', amountMinor: '990', quantity: null },
    ],
    receiptTotalMinor: '4240',
    currency: 'EUR',
    merchant: 'Da Nino',
    date: null,
}

export interface Posted {
    imageBase64?: string
    mimeType?: string
}

/**
 * Intercept both verbs and REMEMBER what was posted. Nothing is asserted inside the handler on
 * purpose: a throw in there never fulfils the route, so the app sits on a request that will never
 * answer and every later failure is a timeout pointing at the wrong line.
 */
export async function stubTheModel(page: Page, posted: Posted) {
    await page.route('**/api/rooms/*/receipt-parse', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({ json: { enabled: true } })
            return
        }
        try {
            Object.assign(posted, JSON.parse(route.request().postData() ?? '{}') as Posted)
        } catch {
            // Recorded as "nothing was posted" and asserted on in the test.
        }
        await route.fulfill({ json: PARSED })
    })
}

/**
 * Snooze the install banner for the run.
 *
 * On an iPhone user agent it arms a 20s idle timer and then opens a sheet over whatever is on
 * screen. These suites are deliberately slow — they wait on a decode, a round trip and three
 * screens — so they are where that timer reliably fires, and a second modal appearing
 * mid-assertion is noise, not signal.
 */
export async function snoozeInstallPrompt(page: Page) {
    await page.addInitScript(() => {
        window.localStorage.setItem('ps:pwa-dismiss-count', '3')
        window.localStorage.setItem('ps:pwa-dismissed-at', String(Date.now()))
    })
}

export async function makeRoom(page: Page, name: string) {
    await snoozeInstallPrompt(page)
    await page.goto('/new')
    await page.getByTestId('room-name').fill(name)
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('room-link')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()
    await expect(page.locator('[data-testid="balance-card"][data-member="Ana"]')).toBeVisible({ timeout: 15_000 })
}
