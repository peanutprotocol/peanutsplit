import { expect, test, type Page } from '@playwright/test'

const weightedState = async (page: Page) => {
    const slug = new URL(page.url()).pathname.split('/').filter(Boolean).at(-1)!
    return page.evaluate(async (roomSlug) => {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomSlug)}`)
        if (!response.ok) throw new Error(`room state failed: ${response.status}`)
        return response.json()
    }, slug)
}

const openSplitEditor = async (page: Page) => {
    await page.getByTestId('expense-split-summary').click()
    await expect(page.getByTestId('split-editor')).toBeVisible()
}

const drawerHeight = async (page: Page) => {
    const box = await page.getByTestId('expense-drawer').boundingBox()
    if (!box) throw new Error('expense drawer has no visible bounding box')
    return box.height
}

const installVisualViewportMock = async (page: Page) => {
    await page.addInitScript(() => {
        const viewport = window.visualViewport
        if (!viewport) return

        let mockedHeight = viewport.height
        Object.defineProperty(viewport, 'height', {
            configurable: true,
            get: () => mockedHeight,
        })
        Object.defineProperty(window, '__setE2EVisualViewportHeight', {
            configurable: true,
            value: (height: number) => {
                mockedHeight = height
                viewport.dispatchEvent(new Event('resize'))
            },
        })
    })
}

const setVisualViewportHeight = async (page: Page, height: number) => {
    await page.evaluate((nextHeight) => {
        const setHeight = (
            window as typeof window & {
                __setE2EVisualViewportHeight?: (height: number) => void
            }
        ).__setE2EVisualViewportHeight
        if (!setHeight) throw new Error('visualViewport mock was not installed')
        setHeight(nextHeight)
    }, height)
}

const expectWeightedExpense = async (page: Page, description: string, splitMode: string, weights: string[]) => {
    await expect
        .poll(
            async () => {
                const state = (await weightedState(page)) as {
                    expenses: Array<{
                        description: string
                        splitMode: string
                        shares: Array<{ splitWeight: string | null }>
                    }>
                }
                const expense = state.expenses.find((candidate) => candidate.description === description)
                return expense
                    ? {
                          splitMode: expense.splitMode,
                          weights: expense.shares.map((share) => share.splitWeight).sort(),
                      }
                    : null
            },
            { timeout: 15_000 }
        )
        .toEqual({ splitMode, weights: [...weights].sort() })
}

test('typed amount lets the drawer grow when payer and sharing settings open', async ({ page }, testInfo) => {
    test.skip(
        testInfo.project.name !== 'mobile',
        'The regression needs a mobile visual viewport and software keyboard.'
    )

    await page.setViewportSize({ width: 375, height: 667 })
    await installVisualViewportMock(page)
    await page.goto('/new')
    await page.getByTestId('room-name').fill(`Drawer resize ${Date.now()}`)
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('room-link')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()

    await page.getByTestId('share-room').click()
    await expect(page.getByRole('dialog', { name: 'Invite the rest' })).toBeVisible()
    await page.getByTestId('add-people-toggle').click()
    await page.getByTestId('add-person-name').fill('Bea')
    await page.getByTestId('add-person').click()
    await expect(page.locator('[data-testid="roster-chip"][data-member="Bea"]')).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('42')
    await expect(page.getByTestId('expense-amount')).toBeFocused()
    const collapsedHeight = await drawerHeight(page)
    const fullViewportHeight = await page.evaluate(() => window.innerHeight)

    // This is the order that exposed the stale Vaul height: type while the
    // keyboard is open, tap a setting, then let the keyboard close.
    await setVisualViewportHeight(page, fullViewportHeight - 300)
    await page.getByTestId('expense-payer-summary').click()
    await setVisualViewportHeight(page, fullViewportHeight)

    await expect(page.getByTestId('payer-editor')).toBeVisible()
    await expect.poll(() => page.getByTestId('expense-drawer').evaluate((element) => element.style.height)).toBe('')
    await expect.poll(() => drawerHeight(page)).toBeGreaterThan(collapsedHeight + 40)
    await page.locator('[data-testid="payer-chip"][data-member="Bea"]').click()
    await expect(page.getByTestId('expense-payer-summary')).toHaveAccessibleName('Bea paid')
    await expect(page.getByTestId('payer-editor')).toHaveCount(0)

    const beforeSplitHeight = await drawerHeight(page)
    await page.getByTestId('expense-split-summary').click()
    await expect(page.getByTestId('split-editor')).toBeVisible()
    await expect.poll(() => drawerHeight(page)).toBeGreaterThan(beforeSplitHeight + 40)

    // The expanded section is not only mounted: its controls can be reached
    // and changed, while the stable action area remains usable.
    await page.locator('[data-testid="participant-toggle"][data-member="Bea"]').click()
    await expect(page.locator('[data-testid="participant-toggle"][data-member="Bea"]')).toHaveAttribute(
        'aria-checked',
        'false'
    )
    await expect(page.getByTestId('save-expense')).toBeVisible()
})

test('More options reveals percentage and shares splits, which survive create and edit', async ({ page }) => {
    test.setTimeout(60_000)

    await page.goto('/new')
    await page.getByTestId('room-name').fill(`Weighted split ${Date.now()}`)
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await expect(page.getByTestId('room-link')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('go-to-room').click()

    await page.getByTestId('share-room').click()
    await expect(page.getByRole('dialog', { name: 'Invite the rest' })).toBeVisible()
    await page.getByTestId('add-people-toggle').click()
    await page.getByTestId('add-person-name').fill('Bea')
    await page.getByTestId('add-person').click()
    await expect(page.locator('[data-testid="roster-chip"][data-member="Bea"]')).toBeVisible()
    await page.keyboard.press('Escape')

    // Equal is the only split type shown until the deliberate disclosure.
    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('100')
    await page.getByTestId('expense-description').fill('Cabin')
    await openSplitEditor(page)
    await expect(page.getByTestId('split-equal')).toBeVisible()
    await expect(page.getByTestId('split-percentage')).toHaveCount(0)
    await expect(page.getByTestId('split-shares')).toHaveCount(0)
    await expect(page.getByTestId('more-split-options')).toHaveAttribute('aria-expanded', 'false')

    await page.getByTestId('more-split-options').click()
    await expect(page.getByTestId('split-percentage')).toBeVisible()
    await expect(page.getByTestId('split-shares')).toBeVisible()
    await page.getByTestId('split-percentage').click()
    // Collapsing keeps the selected advanced radio exposed, and radio arrow
    // keys reopen the method list while moving selection.
    await page.getByTestId('more-split-options').click()
    await expect(page.getByTestId('more-split-options')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('split-percentage')).toBeVisible()
    await expect(page.getByTestId('split-exact')).toHaveCount(0)
    await page.getByTestId('split-percentage').press('ArrowLeft')
    await expect(page.getByTestId('more-split-options')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('split-exact')).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('split-exact').press('ArrowRight')
    await expect(page.getByTestId('split-percentage')).toHaveAttribute('aria-checked', 'true')
    await page.locator('[data-testid="percentage-input"][data-member="Ana"]').fill('25')
    await page.locator('[data-testid="percentage-input"][data-member="Bea"]').fill('75')
    await expect(page.getByTestId('percentage-readout')).toContainText('100% allocated')
    await page.getByTestId('save-expense').click()
    await expect(page.getByTestId('expense-drawer')).toHaveCount(0, {
        timeout: 15_000,
    })
    await expectWeightedExpense(page, 'Cabin', 'PERCENTAGE', ['2500', '7500'])

    // Editing restores the original weights, and a guarded PATCH persists the change.
    await page.locator('[data-testid="expense-row"][data-description="Cabin"]').click()
    await openSplitEditor(page)
    await expect(page.getByTestId('more-split-options')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('[data-testid="percentage-input"][data-member="Ana"]')).toHaveValue('25.00')
    await page.locator('[data-testid="percentage-input"][data-member="Ana"]').fill('40')
    await page.locator('[data-testid="percentage-input"][data-member="Bea"]').fill('60')
    await page.getByTestId('save-expense').click()
    await expect(page.getByTestId('expense-drawer')).toHaveCount(0, { timeout: 15_000 })
    await expectWeightedExpense(page, 'Cabin', 'PERCENTAGE', ['4000', '6000'])

    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('60')
    await page.getByTestId('expense-description').fill('Groceries')
    await openSplitEditor(page)
    await page.getByTestId('more-split-options').click()
    await page.getByTestId('split-shares').click()
    await page.locator('[data-testid="shares-input"][data-member="Ana"]').fill('1')
    await page.locator('[data-testid="shares-input"][data-member="Bea"]').fill('2')
    await expect(page.getByTestId('shares-readout')).toContainText('3')
    await page.getByTestId('save-expense').click()
    await expect(page.getByTestId('expense-drawer')).toHaveCount(0, {
        timeout: 15_000,
    })
    await expectWeightedExpense(page, 'Groceries', 'SHARES', ['1', '2'])

    await page.locator('[data-testid="expense-row"][data-description="Groceries"]').click()
    await openSplitEditor(page)
    await expect(page.locator('[data-testid="shares-input"][data-member="Bea"]')).toHaveValue('2')
    await page.locator('[data-testid="shares-input"][data-member="Bea"]').fill('3')
    await page.getByTestId('save-expense').click()
    await expect(page.getByTestId('expense-drawer')).toHaveCount(0, { timeout: 15_000 })
    await expectWeightedExpense(page, 'Groceries', 'SHARES', ['1', '3'])
})
