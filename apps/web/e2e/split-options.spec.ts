import { expect, type Locator, type Page } from '@playwright/test'
import { test } from './fixtures'
import { enterCreatedRoom } from './helpers'

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

/** Refill the autofocus field after the companion field proves React owns the form. */
const fillRoomCreation = async (page: Page, roomName: string) => {
    await page.getByTestId('room-name').fill(roomName)
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('room-name').fill(roomName)
    await expect(page.getByTestId('create-room')).toBeEnabled()
}

const drawerHeight = async (page: Page) => {
    const box = await page.getByTestId('expense-drawer').boundingBox()
    if (!box) throw new Error('expense drawer has no visible bounding box')
    return box.height
}

const expectDrawerGrowth = async (page: Page, beforeHeight: number) => {
    const maxHeight = await page
        .getByTestId('expense-drawer')
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).maxHeight))
    const expectedHeight = Math.min(beforeHeight + 40, maxHeight) - 1

    await expect.poll(() => drawerHeight(page)).toBeGreaterThanOrEqual(expectedHeight)
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

/**
 * A Playwright locator action is deliberately not used here. `click`, `focus`
 * and `fill` all scroll their target into view first, which can make a disclosure
 * whose newly mounted panel is still below DrawerBody look healthy in automation.
 */
const rawTouchPointInsideExpenseScroll = async (summary: Locator) =>
    summary.evaluate((element) => {
        const scrollport = element.closest<HTMLElement>('[data-testid="expense-scroll"]')
        if (!scrollport) throw new Error('expense summary is outside the expense scrollport')

        const target = element.getBoundingClientRect()
        const port = scrollport.getBoundingClientRect()
        const x = target.left + target.width / 2
        const y = target.top + target.height / 2
        return {
            x,
            y,
            centerIsInside: x >= port.left && x <= port.right && y >= port.top && y <= port.bottom,
        }
    })

/** The whole 44px collapse affordance must be perceivable inside the real scroll owner. */
const collapseControlIsInsideExpenseScroll = async (control: Locator) =>
    control.evaluate((element) => {
        const scrollport = element.closest<HTMLElement>('[data-testid="expense-scroll"]')
        if (!scrollport) throw new Error('expense editor is outside the expense scrollport')

        const target = element.getBoundingClientRect()
        const port = scrollport.getBoundingClientRect()
        return target.height >= 43 && target.top >= port.top - 1 && target.bottom <= port.bottom + 1
    })

const isMemberWrite = (request: { method(): string; url(): string }) =>
    request.method() === 'POST' && /\/api\/rooms\/[^/]+\/members$/.test(new URL(request.url()).pathname)

const isExpenseWrite = (request: { method(): string; url(): string }) =>
    request.method() === 'POST' && /\/api\/rooms\/[^/]+\/expenses$/.test(new URL(request.url()).pathname)

test('typed amount lets the drawer grow when payer and sharing settings open', async ({ page }, testInfo) => {
    test.skip(
        testInfo.project.name !== 'mobile',
        'The regression needs a mobile visual viewport and software keyboard.'
    )

    await page.setViewportSize({ width: 375, height: 667 })
    await installVisualViewportMock(page)
    await page.goto('/new')
    await fillRoomCreation(page, `Drawer resize ${Date.now()}`)
    await page.getByTestId('create-room').click()
    await page.getByTestId('checkpoint-name').fill('Bea')
    await page.getByTestId('checkpoint-add').click()
    await expect(page.locator('[data-testid="checkpoint-member"][data-member="Bea"]')).toBeVisible()
    await enterCreatedRoom(page)

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
    await expectDrawerGrowth(page, collapsedHeight)
    await page.locator('[data-testid="payer-chip"][data-member="Bea"]').click()
    await expect(page.getByTestId('expense-payer-summary')).toHaveAccessibleName('Bea paid')
    await expect(page.getByTestId('payer-editor')).toHaveCount(0)

    const beforeSplitHeight = await drawerHeight(page)
    await page.getByTestId('expense-split-summary').click()
    await expect(page.getByTestId('split-editor')).toBeVisible()
    await expectDrawerGrowth(page, beforeSplitHeight)

    // The expanded section is not only mounted: its controls can be reached
    // and changed, while the stable action area remains usable.
    await page.locator('[data-testid="participant-toggle"][data-member="Bea"]').click()
    await expect(page.locator('[data-testid="participant-toggle"][data-member="Bea"]')).toHaveAttribute(
        'aria-checked',
        'false'
    )
    await expect(page.getByTestId('save-expense')).toBeVisible()
})

test('edit disclosures reveal their controls inside the short mobile scrollport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'The regression is the usable viewport of a phone browser.')
    test.setTimeout(60_000)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 402, height: 670 })
    await page.goto('/new')
    await fillRoomCreation(page, `Short edit drawer ${Date.now()}`)
    await page.getByTestId('create-room').click()
    await page.getByTestId('checkpoint-name').fill('Bea')
    await page.getByTestId('checkpoint-add').click()
    await expect(page.locator('[data-testid="checkpoint-member"][data-member="Bea"]')).toBeVisible()
    await enterCreatedRoom(page)

    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('42')
    await page.getByTestId('expense-description').fill('Short viewport dinner')
    await page.getByTestId('save-expense').click()
    await expect(page.getByTestId('skip-post-aha-share')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('skip-post-aha-share').click()
    await page.locator('[data-testid="expense-row"][data-description="Short viewport dinner"]:not([disabled])').click()
    await expect(page.getByTestId('expense-drawer')).toHaveAttribute('data-state', 'open')

    const disclosures = [
        {
            summary: 'expense-payer-summary',
            editor: 'payer-editor',
            collapse: 'collapse-payer-editor',
        },
        {
            summary: 'expense-split-summary',
            editor: 'split-editor',
            collapse: 'collapse-split-editor',
        },
        {
            summary: 'expense-date-summary',
            editor: 'date-editor',
            collapse: 'collapse-date-editor',
        },
    ] as const

    for (const disclosure of disclosures) {
        const scroll = page.getByTestId('expense-scroll')
        await scroll.evaluate((element) => {
            element.scrollTop = 0
        })
        await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0)

        const summary = page.getByTestId(disclosure.summary)
        const touch = await rawTouchPointInsideExpenseScroll(summary)
        expect(touch.centerIsInside, `${disclosure.summary} must start where a person can tap it`).toBe(true)

        // Raw coordinates reproduce a human tap without Playwright helpfully
        // scrolling either the trigger or the panel that appears below it.
        await page.touchscreen.tap(touch.x, touch.y)
        const editor = page.getByTestId(disclosure.editor)
        await editor.waitFor({ state: 'attached' })
        await expect(summary).toHaveAttribute('aria-pressed', 'true')

        const collapse = page.getByTestId(disclosure.collapse)
        await expect
            .poll(() => collapseControlIsInsideExpenseScroll(collapse), {
                message: `${disclosure.editor} mounted but did not enter the actual expense scrollport`,
            })
            .toBe(true)

        // Close without a locator action: the next loop must begin from an
        // independently controlled scroll position too.
        await summary.evaluate((element) => (element as HTMLButtonElement).click())
        await expect(editor).toHaveCount(0)
    }
})

test('unfinished inline people block expense writes until both inline commits finish', async ({ page }) => {
    test.setTimeout(60_000)

    await page.goto('/new')
    await fillRoomCreation(page, `Inline draft guards ${Date.now()}`)
    await page.getByTestId('create-room').click()
    await page.getByTestId('checkpoint-name').fill('Bea')
    await page.getByTestId('checkpoint-add').click()
    await expect(page.locator('[data-testid="checkpoint-member"][data-member="Bea"]')).toBeVisible()
    await enterCreatedRoom(page)

    let memberWrites = 0
    let expenseWrites = 0
    page.on('request', (request) => {
        if (isMemberWrite(request)) memberWrites += 1
        if (isExpenseWrite(request)) expenseWrites += 1
    })

    await page.getByTestId('open-add-expense').click()
    await page.getByTestId('expense-amount').fill('25')
    await page.getByTestId('expense-description').fill('Committed inline people')

    await page.getByTestId('expense-payer-summary').click()
    await page.getByTestId('add-payer').click()
    await page.getByTestId('new-payer-name').fill('Cora')
    const save = page.getByTestId('save-expense')
    await expect(save).toBeDisabled()
    await save.evaluate((element) => (element as HTMLButtonElement).click())
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    expect({ memberWrites, expenseWrites }).toEqual({ memberWrites: 0, expenseWrites: 0 })

    // A payer name is only an expense draft until the expense transaction; the
    // explicit checkmark remains the way to commit that inline field.
    await page.getByTestId('add-payer-submit').click()
    await expect(page.getByTestId('expense-payer-summary')).toHaveAccessibleName('Cora paid')
    await expect(page.getByTestId('payer-editor')).toHaveCount(0)
    await expect(save).toBeEnabled()
    expect({ memberWrites, expenseWrites }).toEqual({ memberWrites: 0, expenseWrites: 0 })

    await page.getByTestId('expense-split-summary').click()
    await page.getByTestId('add-participant').click()
    await page.getByTestId('new-participant-name').fill('Dora')
    await expect(save).toBeDisabled()
    await save.evaluate((element) => (element as HTMLButtonElement).click())
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    expect({ memberWrites, expenseWrites }).toEqual({ memberWrites: 0, expenseWrites: 0 })

    const participantResponse = page.waitForResponse((response) => isMemberWrite(response.request()))
    await page.getByTestId('add-participant-submit').click()
    expect((await participantResponse).ok()).toBe(true)
    await expect(page.locator('[data-testid="participant-toggle"][data-member="Dora"]')).toHaveAttribute(
        'aria-checked',
        'true'
    )
    await expect(save).toBeEnabled()
    expect({ memberWrites, expenseWrites }).toEqual({ memberWrites: 1, expenseWrites: 0 })

    const expenseResponse = page.waitForResponse((response) => isExpenseWrite(response.request()))
    await save.click()
    expect((await expenseResponse).ok()).toBe(true)
    await expect(page.getByTestId('expense-drawer')).toHaveCount(0, { timeout: 15_000 })
    expect({ memberWrites, expenseWrites }).toEqual({ memberWrites: 1, expenseWrites: 1 })

    await expect
        .poll(async () => {
            const state = (await weightedState(page)) as { members: Array<{ name: string }> }
            return state.members.map((member) => member.name).sort()
        })
        .toEqual(['Ana', 'Bea', 'Cora', 'Dora'])
})

test('More options reveals percentage and shares splits, which survive create and edit', async ({ page }) => {
    test.setTimeout(60_000)

    await page.goto('/new')
    await fillRoomCreation(page, `Weighted split ${Date.now()}`)
    await page.getByTestId('create-room').click()
    await page.getByTestId('checkpoint-name').fill('Bea')
    await page.getByTestId('checkpoint-add').click()
    await expect(page.locator('[data-testid="checkpoint-member"][data-member="Bea"]')).toBeVisible()
    await enterCreatedRoom(page)

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
    await expect(page.getByTestId('skip-post-aha-share')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('skip-post-aha-share').click()

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
