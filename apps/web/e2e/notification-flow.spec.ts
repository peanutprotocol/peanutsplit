import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { test } from './fixtures'
import { openCurrentRoomSettings } from './helpers'
import { modelNotificationBrowser } from './notification-browser'

test.setTimeout(60_000)

interface MatureRoom {
    slug: string
    name: string
}

async function createMatureRoom(request: APIRequestContext, name: string): Promise<MatureRoom> {
    const response = await request.post('/api/rooms', {
        data: { name, currency: 'EUR', creatorName: 'Ana', memberNames: ['Bea'] },
    })
    expect(response.status()).toBe(201)
    const created = await response.json()
    const expense = await request.post(`/api/rooms/${created.room.slug}/expenses`, {
        headers: { 'X-Member-Token': created.memberToken },
        data: {
            description: 'Dinner',
            amountMinor: '4000',
            currency: 'EUR',
            paidById: created.memberId,
            splitMode: 'EQUAL',
            participantIds: created.members.map((member: { id: string }) => member.id),
        },
    })
    expect(expense.status()).toBe(201)
    return { slug: created.room.slug, name }
}

async function joinMatureRoom(page: Page, room: MatureRoom): Promise<void> {
    await page.goto(`/r/${room.slug}`)
    await expect(page.getByTestId('join-gate')).toBeVisible()
    await expect(page.getByTestId('room-updates-prompt')).toHaveCount(0)
    await page.locator('[data-testid="claim-member"][data-member="Bea"]').click()
    await expect(page.getByTestId('join-gate')).toHaveCount(0)
    await expect(page.getByTestId('room-title')).toHaveText(room.name)
}

async function subscriptionStatus(page: Page, slug: string, endpoint: string): Promise<boolean> {
    return page.evaluate(
        async ({ slug, endpoint }) => {
            const identity = JSON.parse(localStorage.getItem(`ps:member:${slug}`) ?? 'null')
            const response = await fetch(`/api/rooms/${slug}/push-subscriptions/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint, memberId: identity.memberId, memberToken: identity.token }),
            })
            if (!response.ok) throw new Error(`status failed: ${response.status}`)
            return (await response.json()).subscribed as boolean
        },
        { slug, endpoint }
    )
}

async function permissionRequests(page: Page): Promise<number> {
    return page.evaluate(() => Number(localStorage.getItem('__qa-push-permission-requests') ?? 0))
}

test('the first shared expense keeps Share first and then offers updates without stacked prompts', async ({ page }) => {
    await modelNotificationBrowser(page)
    await page.addInitScript(() =>
        Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} })
    )
    await page.goto('/new')
    await page.getByTestId('room-name').fill(`First split updates ${Date.now()}`)
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('room-person-name').first().fill('Bea')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('open-add-expense')).toBeVisible()
    await expect(page.getByTestId('room-updates-prompt')).toHaveCount(0)
    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('40')
    await page.getByTestId('expense-description').fill('Dinner')
    await page.getByTestId('save-expense').click()
    const share = page.getByRole('dialog', { name: 'First split done' })
    await expect(share).toBeVisible()
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('room-updates-prompt')).toHaveCount(0)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    await share.getByTestId('share-link').click()
    await share.getByTestId('finish-post-aha-share').click()
    await expect(page.getByTestId('room-updates-prompt')).toBeVisible({ timeout: 6_000 })
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    expect(await permissionRequests(page)).toBe(0)
})

test('Android asks only after a tap, saves this room, and keeps Settings in sync without an immediate install ask', async ({
    page,
    request,
}) => {
    const endpoint = await modelNotificationBrowser(page)
    const room = await createMatureRoom(request, 'Lisbon weekend')
    await joinMatureRoom(page, room)
    const prompt = page.getByTestId('room-updates-prompt')
    await expect(prompt).toBeVisible({ timeout: 6_000 })
    await expect(prompt.getByTestId('room-updates-enable')).toHaveText('Notify me')
    await expect(prompt.getByTestId('room-updates-enable')).toHaveAccessibleName('Notify me')
    await expect(prompt).toHaveAccessibleName(`Notify me about ${room.name}`)
    await expect(prompt).toHaveText('Notify meNot now')
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    expect(await permissionRequests(page)).toBe(0)
    expect(await subscriptionStatus(page, room.slug, endpoint)).toBe(false)
    await prompt.scrollIntoViewIfNeeded()
    await test.info().attach('android-room-updates', { body: await page.screenshot(), contentType: 'image/png' })

    let releaseSave: (() => void) | undefined
    const saveGate = new Promise<void>((resolve) => {
        releaseSave = resolve
    })
    await page.route(`**/api/rooms/${room.slug}/push-subscriptions`, async (route) => {
        if (route.request().method() === 'POST') await saveGate
        await route.continue()
    })
    const saveStarted = page.waitForRequest(
        (req) => req.method() === 'POST' && req.url().endsWith('/push-subscriptions')
    )
    await prompt.getByTestId('room-updates-enable').click()
    await saveStarted
    await expect(prompt.getByTestId('room-updates-enable')).toBeDisabled()
    await expect(prompt.getByTestId('room-updates-enable')).toHaveAttribute('aria-busy', 'true')
    await expect(prompt.getByTestId('room-updates-enable')).toHaveAttribute('aria-pressed', 'false')
    expect(await subscriptionStatus(page, room.slug, endpoint)).toBe(false)
    releaseSave?.()
    await expect.poll(() => subscriptionStatus(page, room.slug, endpoint)).toBe(true)
    await expect(prompt.getByTestId('room-updates-enable')).toHaveAttribute('aria-pressed', 'true')
    await test.info().attach('android-updates-enabled', { body: await page.screenshot(), contentType: 'image/png' })
    await expect(prompt).toHaveCount(0, { timeout: 6_000 })
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    expect(await permissionRequests(page)).toBe(1)

    await openCurrentRoomSettings(page)
    await expect(page.getByTestId('push-disable')).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('close-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/r/${room.slug}$`))
    await page.reload()
    await expect(page.getByTestId('room-title')).toBeVisible()
    await page.waitForTimeout(2_000)
    await expect(prompt).toHaveCount(0)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)

    await page.clock.setFixedTime(new Date(Date.now() + 60 * 60 * 1_000))
    await page.reload()
    await expect(page.getByTestId('install-prompt')).toBeVisible({ timeout: 6_000 })
    await expect(prompt).toHaveCount(0)
    expect(await subscriptionStatus(page, room.slug, endpoint)).toBe(true)
    expect(await permissionRequests(page)).toBe(1)
})

test('Not now snoozes both prompts across rooms and a later visit offers the remaining step', async ({
    page,
    request,
}) => {
    await modelNotificationBrowser(page)
    const first = await createMatureRoom(request, `Later updates ${Date.now()}`)
    const second = await createMatureRoom(request, `Other updates ${Date.now()}`)
    await joinMatureRoom(page, first)
    await expect(page.getByTestId('room-updates-prompt')).toBeVisible({ timeout: 6_000 })
    await page.getByTestId('room-updates-dismiss').click()
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('room-updates-prompt')).toHaveCount(0)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    await joinMatureRoom(page, second)
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('room-updates-prompt')).toHaveCount(0)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    expect(await permissionRequests(page)).toBe(0)

    // Move the browser clock beyond the persisted snooze without bypassing its decision logic.
    await page.clock.setFixedTime(new Date(Date.now() + 32 * 24 * 60 * 60 * 1_000))
    await page.reload()
    await expect(page.getByTestId('room-updates-prompt')).toBeVisible({ timeout: 6_000 })
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    expect(await permissionRequests(page)).toBe(0)
})

test('denial leaves browser settings recovery and never replaces the refused ask with installation', async ({
    page,
    request,
}) => {
    await modelNotificationBrowser(page, { permissionResult: 'denied' })
    const room = await createMatureRoom(request, `Blocked updates ${Date.now()}`)
    await joinMatureRoom(page, room)
    await expect(page.getByTestId('room-updates-prompt')).toBeVisible({ timeout: 6_000 })
    await page.getByTestId('room-updates-enable').click()
    await expect(page.getByTestId('room-updates-prompt')).toHaveCount(0, { timeout: 6_000 })
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    expect(await permissionRequests(page)).toBe(1)
    await openCurrentRoomSettings(page)
    await expect(page.getByTestId('push-enable')).toBeDisabled()
    await expect(page.getByTestId('push-enable')).toContainText('Blocked in your browser settings.')
})

test('unsupported Android keeps the existing install path without a notification control', async ({
    page,
    request,
}) => {
    await modelNotificationBrowser(page, { unsupported: true })
    await joinMatureRoom(page, await createMatureRoom(request, `Install fallback ${Date.now()}`))
    await expect(page.getByTestId('install-prompt')).toBeVisible({ timeout: 6_000 })
    await expect(page.getByTestId('room-updates-prompt')).toHaveCount(0)
    await expect(page.getByTestId('install-prompt').getByRole('button', { name: 'Install Split' })).toBeVisible()
})

for (const platform of ['android', 'ios'] as const) {
    test(`${platform}: dismissing installation in a settled room also snoozes notifications when a new expense creates a balance`, async ({
        page,
        request,
    }) => {
        await modelNotificationBrowser(page, { platform, unsupported: platform === 'ios' })
        await joinMatureRoom(page, await createMatureRoom(request, `Settled room follow-up ${Date.now()}`))
        const addExpense = async (amount: string, description: string) => {
            await page.getByTestId('open-add-expense').click()
            await page.getByTestId('expense-amount').fill(amount)
            await page.getByTestId('expense-description').fill(description)
            await page.getByTestId('save-expense').click()
            await expect(page.getByTestId('expense-drawer')).toHaveCount(0)
        }
        await addExpense('40', 'Bea pays the next dinner')
        await expect(page.locator('main [data-testid="all-settled"]')).toBeVisible()
        await page.reload()
        const install = page.getByTestId('install-prompt')
        await expect(install).toBeVisible({ timeout: 6_000 })
        await expect(install).toHaveText('Install SplitNot now')
        await install.getByRole('button', { name: 'Not now' }).click()
        await expect(install).toHaveCount(0)

        await addExpense('10', 'Another shared expense')
        await expect(page.getByTestId('expense-row')).toHaveCount(3)
        await expect(page.locator('main [data-testid="all-settled"]')).toHaveCount(0)
        await page.waitForTimeout(2_000)
        await expect(page.getByTestId('room-updates-prompt')).toHaveCount(0)
        await expect(install).toHaveCount(0)
        expect(await permissionRequests(page)).toBe(0)
    })
}

test('enabling from Settings waits for a real return before offering installation', async ({ page, request }) => {
    await modelNotificationBrowser(page)
    const room = await createMatureRoom(request, 'Weekend plans')
    await joinMatureRoom(page, room)
    await page.getByTestId('open-room-settings').click()
    await expect(page.getByTestId('settings-sheet')).toBeVisible()
    await expect(page.getByTestId('room-updates-prompt')).toHaveCount(0)
    await page.getByTestId('push-enable').click()
    await expect(page.getByTestId('push-disable')).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('close-room-settings').click()

    const started = Date.now()
    await page.clock.setFixedTime(new Date(started + 31 * 60 * 1_000))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('room-updates-prompt')).toHaveCount(0)
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)

    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.clock.setFixedTime(new Date(started + 62 * 60 * 1_000))
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
        document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(page.getByTestId('install-prompt')).toBeVisible({ timeout: 6_000 })
    await expect(page.getByTestId('room-updates-prompt')).toHaveCount(0)
    expect(await permissionRequests(page)).toBe(1)
})

test('a subscription belongs to its room and disabling one preserves another room on the same device', async ({
    page,
    request,
}) => {
    const endpoint = await modelNotificationBrowser(page)
    const first = await createMatureRoom(request, `First subscribed room ${Date.now()}`)
    const second = await createMatureRoom(request, `Second subscribed room ${Date.now()}`)
    await joinMatureRoom(page, first)
    await expect(page.getByTestId('room-updates-prompt')).toBeVisible({ timeout: 6_000 })
    await page.getByTestId('room-updates-enable').click()
    await expect.poll(() => subscriptionStatus(page, first.slug, endpoint)).toBe(true)
    await joinMatureRoom(page, second)
    expect(await subscriptionStatus(page, second.slug, endpoint)).toBe(false)
    await openCurrentRoomSettings(page)
    await expect(page.getByTestId('push-enable')).toHaveAttribute('aria-checked', 'false')
    await page.getByTestId('push-enable').click()
    await expect(page.getByTestId('push-disable')).toHaveAttribute('aria-checked', 'true')
    expect(await subscriptionStatus(page, second.slug, endpoint)).toBe(true)

    await page.goto(`/r/${first.slug}`)
    await openCurrentRoomSettings(page)
    await page.getByTestId('push-disable').click()
    await expect(page.getByTestId('push-enable')).toHaveAttribute('aria-checked', 'false')
    expect(await subscriptionStatus(page, first.slug, endpoint)).toBe(false)
    expect(await subscriptionStatus(page, second.slug, endpoint)).toBe(true)
    expect(await page.evaluate(() => localStorage.getItem('__qa-push-revocations'))).toBeNull()
    await page.getByTestId('close-room-settings').click()
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('room-updates-prompt')).toHaveCount(0)
})

test('a failed server save stays off and can be retried without losing the notification offer', async ({
    page,
    request,
}) => {
    const endpoint = await modelNotificationBrowser(page)
    const room = await createMatureRoom(request, `Retry updates ${Date.now()}`)
    await joinMatureRoom(page, room)
    const prompt = page.getByTestId('room-updates-prompt')
    await expect(prompt).toBeVisible({ timeout: 6_000 })
    await page.route(`**/api/rooms/${room.slug}/push-subscriptions`, (route) =>
        route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL', message: 'temporary failure' } }),
        })
    )
    await prompt.getByTestId('room-updates-enable').click()
    await expect(prompt.getByTestId('room-updates-enable')).toBeEnabled()
    await expect(prompt.getByTestId('room-updates-enable')).toHaveAttribute('aria-pressed', 'false')
    expect(await subscriptionStatus(page, room.slug, endpoint)).toBe(false)
    await page.unroute(`**/api/rooms/${room.slug}/push-subscriptions`)
    await prompt.getByTestId('room-updates-enable').click()
    await expect.poll(() => subscriptionStatus(page, room.slug, endpoint)).toBe(true)
})

test('a delayed notification save keeps Settings busy and cannot start a second subscription', async ({
    page,
    request,
}) => {
    const endpoint = await modelNotificationBrowser(page)
    const room = await createMatureRoom(request, `Busy updates ${Date.now()}`)
    await joinMatureRoom(page, room)
    await expect(page.getByTestId('room-updates-prompt')).toBeVisible({ timeout: 6_000 })
    let releaseSave: (() => void) | undefined
    let writes = 0
    const gate = new Promise<void>((resolve) => {
        releaseSave = resolve
    })
    await page.route(`**/api/rooms/${room.slug}/push-subscriptions`, async (route) => {
        writes += 1
        await gate
        await route.continue()
    })
    const started = page.waitForRequest((req) => req.url().endsWith('/push-subscriptions'))
    await page.getByTestId('room-updates-enable').click()
    await started
    await openCurrentRoomSettings(page)
    await expect(page.getByTestId('push-pending')).toBeVisible()
    await expect(page.getByTestId('push-pending')).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByTestId('push-enable')).toHaveCount(0)
    await expect(page.getByTestId('room-updates-prompt')).toHaveCount(0)
    expect(writes).toBe(1)
    releaseSave?.()
    await expect.poll(() => subscriptionStatus(page, room.slug, endpoint)).toBe(true)
    await expect(page.getByTestId('settings-sheet')).toBeVisible()
    await expect(page.getByTestId('push-disable')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    expect(writes).toBe(1)
    expect(await permissionRequests(page)).toBe(1)
    await expect(page).toHaveURL(new RegExp(`/r/${room.slug}`))
})

test.describe('narrow notification layout', () => {
    test.use({ viewport: { width: 320, height: 844 } })

    test('the inline offer fits 320px and yields to an expense drawer without prompting', async ({ page, request }) => {
        await modelNotificationBrowser(page)
        await joinMatureRoom(
            page,
            await createMatureRoom(request, `A long weekend room with all our friends ${Date.now()}`)
        )
        const prompt = page.getByTestId('room-updates-prompt')
        await expect(prompt).toBeVisible({ timeout: 6_000 })
        const [box, actionBox, dismissBox] = await Promise.all([
            prompt.boundingBox(),
            prompt.getByTestId('room-updates-enable').boundingBox(),
            prompt.getByTestId('room-updates-dismiss').boundingBox(),
        ])
        expect(actionBox).not.toBeNull()
        expect(dismissBox).not.toBeNull()
        expect(dismissBox!.y).toBeGreaterThan(actionBox!.y)
        expect(Math.abs(dismissBox!.width - actionBox!.width)).toBeLessThanOrEqual(1)
        await expect(prompt).toHaveText('Notify meNot now')
        await expect(prompt.locator('button')).toHaveCount(2)
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(320)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
        await prompt.scrollIntoViewIfNeeded()
        await test.info().attach('room-updates-320px', { body: await page.screenshot(), contentType: 'image/png' })
        await page.getByTestId('open-add-expense').click()
        await expect(page.getByTestId('expense-drawer')).toBeVisible()
        await expect(prompt).toHaveCount(0)
        expect(await permissionRequests(page)).toBe(0)
    })
})

test('iOS without browser push APIs installs first and resumes its room after a cookie-only app launch', async ({
    page,
    request,
    newDevice,
}) => {
    await modelNotificationBrowser(page, { platform: 'ios', unsupported: true })
    const room = await createMatureRoom(request, 'Summer trip')
    await joinMatureRoom(page, room)
    const prompt = page.getByTestId('room-updates-prompt')
    await expect(prompt).toBeVisible({ timeout: 6_000 })
    await expect(prompt.getByTestId('room-updates-install')).toHaveText('Install Split')
    await expect(prompt).toHaveText('Install SplitNot now')
    await expect(page.getByTestId('install-prompt')).toHaveCount(0)
    await prompt.scrollIntoViewIfNeeded()
    await test.info().attach('ios-install-for-updates', { body: await page.screenshot(), contentType: 'image/png' })
    await prompt.getByTestId('room-updates-install').click()
    await expect(page).toHaveURL(/\/app\?install=1&source=auto$/)
    const instructions = page.getByTestId('install-app-surface')
    await expect(instructions.locator('ol > li')).toHaveCount(4)
    await expect(instructions.getByTestId('install-step-visual')).toHaveCount(4)
    await expect
        .poll(() =>
            instructions
                .getByTestId('install-step-visual')
                .locator('img')
                .evaluateAll(
                    (images) =>
                        images.length > 0 &&
                        images.every((element) => {
                            const image = element as HTMLImageElement
                            return image.complete && image.naturalWidth > 0
                        })
                )
        )
        .toBe(true)
    await test.info().attach('ios-install-instructions', { body: await page.screenshot(), contentType: 'image/png' })
    const cookies = (await page.context().cookies()).filter((cookie) => cookie.name.includes('install-handoff'))
    expect(cookies).toHaveLength(2)
    expect(cookies.find((cookie) => cookie.name.includes('ready'))?.value).toBe('notifications')

    const installed = await newDevice()
    const endpoint = await modelNotificationBrowser(installed, { platform: 'ios', standalone: true })
    await installed.context().addCookies(cookies)
    await installed.goto(new URL('/app', page.url()).href)
    await expect(installed).toHaveURL(new RegExp(`/r/${room.slug}$`), { timeout: 15_000 })
    await expect(installed.getByTestId('join-gate')).toHaveCount(0)
    await expect(installed.getByTestId('room-updates-prompt')).toBeVisible({ timeout: 6_000 })
    expect(await permissionRequests(installed)).toBe(0)
    expect(await subscriptionStatus(installed, room.slug, endpoint)).toBe(false)
    await installed.getByTestId('room-updates-prompt').scrollIntoViewIfNeeded()
    await test.info().attach('ios-resumed-updates', { body: await installed.screenshot(), contentType: 'image/png' })
    await installed.getByTestId('room-updates-enable').click()
    await expect.poll(() => subscriptionStatus(installed, room.slug, endpoint)).toBe(true)
    await expect(installed.getByTestId('room-updates-prompt')).toHaveCount(0, { timeout: 6_000 })
    expect(await permissionRequests(installed)).toBe(1)
})
