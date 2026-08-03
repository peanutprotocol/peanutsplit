import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.61' } })

interface CreatedRoom {
    room: { slug: string }
    memberId: string
}

const createRoom = async (request: APIRequestContext, label: string): Promise<CreatedRoom> => {
    const response = await request.post('/api/rooms', {
        data: { name: `${label} ${Date.now()}`, currency: 'EUR', creatorName: 'Ana' },
    })
    expect(response.status()).toBe(201)
    return response.json()
}

const addMember = async (request: APIRequestContext, slug: string, name: string) => {
    const response = await request.post(`/api/rooms/${slug}/members`, { data: { name } })
    expect(response.status()).toBe(201)
    return response.json() as Promise<{ memberId: string }>
}

const addExpense = async (
    request: APIRequestContext,
    room: CreatedRoom,
    description: string,
    participantIds?: string[],
    amountMinor = '3000'
) => {
    const response = await request.post(`/api/rooms/${room.room.slug}/expenses`, {
        data: {
            description,
            amountMinor,
            currency: 'EUR',
            paidById: room.memberId,
            splitMode: 'EQUAL',
            participantIds,
        },
    })
    expect(response.status()).toBe(201)
}

const expectTapFloor = async (locator: Locator) => {
    const box = await locator.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
}

const expectContained = async (locator: Locator) => {
    await expect.poll(() => locator.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
}

const claim = async (page: Page, slug: string, name: string) => {
    await page.goto(`/r/${slug}`)
    await expect(page.getByTestId('join-gate')).toBeVisible({ timeout: 15_000 })
    await page.locator(`[data-testid="claim-member"][data-member="${name}"]`).click()
    await expect(page.getByTestId('join-gate')).toHaveCount(0)
}

test('any recorder gets a named room prompt and one review sheet that closes on success', async ({ page, request }) => {
    const room = await createRoom(request, 'Room-level catch-up')
    await addExpense(request, room, 'Dinner')
    await new Promise((resolve) => setTimeout(resolve, 10))
    await addMember(request, room.room.slug, 'Dani')

    // Ana is the recorder, not the late joiner. Claiming identity only enters
    // the room: catch-up is derived from room state and never auto-opens.
    await claim(page, room.room.slug, 'Ana')
    const banner = page.getByTestId('latecomer-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Did Dani share any earlier expenses?')
    await expect(page.getByTestId('latecomer-flow')).toHaveCount(0)
    await expectTapFloor(banner.getByTestId('latecomer-review'))
    await expectTapFloor(banner.getByTestId('latecomer-dismiss'))

    await page.getByTestId('latecomer-review').click()
    const dialog = page.getByRole('dialog', { name: 'Earlier expenses for Dani' })
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    await expect.poll(() => page.locator('main').evaluate((element) => !!element.closest('[inert]'))).toBe(true)
    await expect(dialog.getByRole('heading', { name: 'Earlier expenses for Dani' })).toBeVisible()
    await expect(dialog).toContainText('Select the expenses Dani shared.')
    await expect(dialog.getByRole('button', { name: /Dinner/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(dialog).toContainText('After the update, Dani owes €15.00')
    await expect(dialog.getByTestId('latecomer-confirm')).toHaveText('Update 1 expense')
    await expect(dialog.getByTestId('latecomer-not-now')).toHaveText('Not now')
    await expect(page.getByTestId('latecomer-was-there')).toHaveCount(0)
    await expect(page.getByTestId('latecomer-progress')).toHaveCount(0)
    await expect(page.getByTestId('latecomer-done')).toHaveCount(0)

    await dialog.getByTestId('latecomer-confirm').click()
    await expect(dialog).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByTestId('latecomer-banner')).toHaveCount(0)
    await expect(page.getByTestId('room-title')).toBeFocused()
    await expect(page.locator('[data-testid="balance-card"][data-member="Dani"]')).toHaveAttribute('data-net', '-1500')

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('Catch-up undone')).toBeVisible()
    await expect(page.locator('[data-testid="balance-card"][data-member="Dani"]')).toHaveAttribute('data-net', '0')
})

test('optional subsets start off and Not now changes neither identity nor ledger', async ({ page, request }) => {
    const room = await createRoom(request, 'Optional catch-up')
    await addMember(request, room.room.slug, 'Bea')
    await addExpense(request, room, 'Ana only', [room.memberId])
    await new Promise((resolve) => setTimeout(resolve, 10))
    await addMember(request, room.room.slug, 'Dani')

    await claim(page, room.room.slug, 'Ana')
    await page.getByTestId('latecomer-review').click()
    const dialog = page.getByRole('dialog', { name: 'Earlier expenses for Dani' })
    const subset = dialog.getByRole('button', { name: /Ana only/ })
    await expect(subset).toHaveAttribute('aria-pressed', 'false')
    await expect(dialog.getByTestId('latecomer-confirm')).toHaveText('Leave earlier expenses unchanged')

    await dialog.getByTestId('latecomer-not-now').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('latecomer-banner')).toHaveCount(0)
    await expect(page.getByTestId('room-title')).toBeFocused()
    await expect(page.locator('[data-testid="balance-card"][data-member="Dani"]')).toHaveAttribute('data-net', '0')

    // The defer is device-local and survives a refresh; no JoinGate or claim
    // transition is replayed to make it stick.
    await page.reload()
    await expect(page.getByTestId('join-gate')).toHaveCount(0)
    await expect(page.getByTestId('latecomer-banner')).toHaveCount(0)
})

test('Share keeps priority over the room prompt and an empty room has no catch-up', async ({ page, request }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    const longName = 'D'.repeat(80)
    const room = await createRoom(request, 'Share priority')
    await addExpense(request, room, 'Cabin', undefined, '9007199254740991')
    await new Promise((resolve) => setTimeout(resolve, 10))
    await addMember(request, room.room.slug, longName)
    await claim(page, room.room.slug, 'Ana')

    const banner = page.getByTestId('latecomer-banner')
    await expect(banner).toBeVisible()
    await expectContained(banner)
    await page.getByTestId('share-room').click()
    await expect(page.getByRole('dialog', { name: 'Share room' })).toBeVisible()
    await expect(page.getByTestId('latecomer-flow')).toHaveCount(0)
    await expect(page.getByTestId('latecomer-banner')).toHaveCount(0)
    await page.getByTestId('close-share').click()
    await expect(banner).toBeVisible()

    await banner.getByTestId('latecomer-review').click()
    const review = page.getByTestId('latecomer-flow')
    await expect(review).toBeVisible()
    await expectContained(review)
    await expectContained(review.getByRole('heading'))
    await expectContained(review.getByRole('status'))
    await expectContained(review.getByRole('button', { name: /Cabin/ }))
    await review.getByTestId('latecomer-not-now').click()
    await expect(review).toHaveCount(0)

    const empty = await createRoom(request, 'Empty catch-up')
    await addMember(request, empty.room.slug, 'Dani')
    await claim(page, empty.room.slug, 'Ana')
    await expect(page.getByTestId('latecomer-banner')).toHaveCount(0)
    await expect(page.getByTestId('open-add-expense')).toBeVisible()
})
