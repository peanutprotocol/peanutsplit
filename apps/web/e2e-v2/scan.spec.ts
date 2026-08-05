import { expect, test, type Page } from '@playwright/test'
import { makeRoom, mockCamera, PARSED, stubTheModel, TINY_JPEG, type Posted } from './helpers'

/**
 * Receipt scanning is deliberately tested with a real browser and a fake camera/model boundary.
 * The tests exercise image preparation, modal ownership, focus, cancellation and the final money
 * write, but never request a host camera or spend provider tokens.
 */

const everythingOnScreenIsTheOverlay = (page: Page) =>
    page.evaluate(() => {
        const misses: { x: number; y: number; hit: string }[] = []
        for (let column = 1; column <= 3; column++) {
            for (let row = 1; row <= 3; row++) {
                const x = (window.innerWidth * column) / 4
                const y = (window.innerHeight * row) / 4
                const element = document.elementFromPoint(x, y)
                if (!element?.closest('[data-testid="scan-flow"]')) {
                    misses.push({ x, y, hit: element?.tagName ?? 'nothing' })
                }
            }
        }
        return misses
    })

const pickPhoto = (page: Page) =>
    page.getByTestId('scan-upload-input').setInputFiles({
        name: 'bill.jpg',
        mimeType: 'image/jpeg',
        buffer: TINY_JPEG,
    })

async function openScanner(page: Page) {
    await page.getByTestId('open-add-expense').click()
    const scanButton = page.getByTestId('scan-bill')
    await expect(scanButton).toBeVisible({ timeout: 15_000 })
    await scanButton.click()
    await expect(page.getByTestId('scan-camera')).toBeVisible({ timeout: 15_000 })
}

async function startUploadScan(page: Page) {
    await openScanner(page)
    await pickPhoto(page)
    await expect(page.getByTestId('scan-flow')).toBeVisible({ timeout: 15_000 })
}

const expensePostCount = (page: Page) => {
    let calls = 0
    page.on('request', (request) => {
        if (request.method() === 'POST' && /\/api\/rooms\/[^/]+\/expenses$/.test(new URL(request.url()).pathname)) {
            calls++
        }
    })
    return () => calls
}

test('camera-first entry is the sole modal, fits a narrow phone, traps focus, and restores the draft', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await mockCamera(page, 'ready')
    const posted: Posted = {}
    await stubTheModel(page, posted)
    await makeRoom(page, 'Camera trip')

    await page.getByTestId('open-add-expense').click()
    await expect(page.getByTestId('scan-bill')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('expense-description').fill('Draft dinner')
    await page.getByTestId('expense-amount').fill('19.20')
    await page.getByTestId('scan-bill').click()

    const flow = page.getByTestId('scan-flow')
    const sheet = page.getByTestId('scan-camera-sheet')
    const terms = page.locator('#scan-provider-terms')
    await expect(flow).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('scan-shutter')).toBeEnabled()
    await expect(page.getByTestId('scan-upload')).toBeEnabled()
    await expect(page.getByTestId('expense-drawer')).toBeHidden({ timeout: 15_000 })
    await expect(page.locator('[role="dialog"]:visible')).toHaveCount(1)
    await expect(terms).toContainText('OpenRouter')
    await expect(terms).toContainText('Gemini')
    await expect(page.getByTestId('scan-shutter')).toHaveAttribute('aria-describedby', 'scan-provider-terms')
    await expect(page.getByTestId('scan-upload')).toHaveAttribute('aria-describedby', 'scan-provider-terms')
    expect(posted.calls ?? 0).toBe(0)

    await expect
        .poll(() =>
            page.evaluate(
                () => (window as typeof window & { __scanCameraE2E?: { calls: number } }).__scanCameraE2E?.calls
            )
        )
        .toBeGreaterThanOrEqual(1)
    expect(
        await page.evaluate(
            () =>
                (
                    window as typeof window & {
                        __scanCameraE2E?: { constraints: MediaStreamConstraints | null }
                    }
                ).__scanCameraE2E?.constraints
        )
    ).toEqual({ audio: false, video: { facingMode: { ideal: 'environment' } } })

    const layout = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect()
        const cameraSheet = box('[data-testid="scan-camera-sheet"]')
        const providerTerms = box('#scan-provider-terms')
        const shutter = box('[data-testid="scan-shutter"]')
        const upload = box('[data-testid="scan-upload"]')
        const close = box('[data-testid="scan-close"]')
        if (!cameraSheet || !providerTerms || !shutter || !upload || !close) return null
        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            sheet: {
                left: cameraSheet.left,
                right: cameraSheet.right,
                top: cameraSheet.top,
                bottom: cameraSheet.bottom,
                height: cameraSheet.height,
            },
            terms: { top: providerTerms.top, bottom: providerTerms.bottom },
            targets: [
                { width: shutter.width, height: shutter.height },
                { width: upload.width, height: upload.height },
                { width: close.width, height: close.height },
            ],
        }
    })
    expect(layout).not.toBeNull()
    expect(layout!.documentWidth).toBeLessThanOrEqual(layout!.viewport.width)
    expect(layout!.sheet.left).toBeGreaterThanOrEqual(0)
    expect(layout!.sheet.right).toBeLessThanOrEqual(layout!.viewport.width)
    expect(layout!.sheet.bottom).toBeLessThanOrEqual(layout!.viewport.height)
    expect(layout!.sheet.height).toBeGreaterThanOrEqual(184)
    expect(layout!.sheet.height).toBeLessThanOrEqual(224)
    expect(layout!.terms.top).toBeGreaterThanOrEqual(layout!.sheet.top)
    expect(layout!.terms.bottom).toBeLessThanOrEqual(layout!.sheet.bottom)
    for (const target of layout!.targets) {
        expect(target.width).toBeGreaterThanOrEqual(44)
        expect(target.height).toBeGreaterThanOrEqual(44)
    }

    // Short landscape viewports use a compact horizontal control row so the
    // live preview remains a real framing surface rather than a two-pixel line.
    await page.setViewportSize({ width: 568, height: 320 })
    const landscape = await page.evaluate(() => {
        const frame = document.querySelector('[data-testid="scan-frame"]')?.getBoundingClientRect()
        const cameraSheet = document.querySelector('[data-testid="scan-camera-sheet"]')?.getBoundingClientRect()
        const terms = document.querySelector('#scan-provider-terms')?.getBoundingClientRect()
        const shutter = document.querySelector('[data-testid="scan-shutter"]')?.getBoundingClientRect()
        const upload = document.querySelector('[data-testid="scan-upload"]')?.getBoundingClientRect()
        if (!frame || !cameraSheet || !terms || !shutter || !upload) return null
        return {
            frameHeight: frame.height,
            sheetHeight: cameraSheet.height,
            sheetBottom: cameraSheet.bottom,
            termsBottom: terms.bottom,
            targets: [shutter, upload].map(({ width, height }) => ({ width, height })),
        }
    })
    expect(landscape).not.toBeNull()
    expect(landscape!.frameHeight).toBeGreaterThanOrEqual(80)
    expect(landscape!.sheetHeight).toBeLessThanOrEqual(107)
    expect(landscape!.sheetBottom).toBeLessThanOrEqual(320)
    expect(landscape!.termsBottom).toBeLessThanOrEqual(landscape!.sheetBottom)
    for (const target of landscape!.targets) {
        expect(target.width).toBeGreaterThanOrEqual(44)
        expect(target.height).toBeGreaterThanOrEqual(44)
    }
    await page.setViewportSize({ width: 320, height: 568 })

    await expect
        .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="scan-flow"]'))))
        .toBe(true)
    for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
        await page.keyboard.press(key)
        expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="scan-flow"]')))).toBe(
            true
        )
    }
    expect(
        await page.evaluate(() => {
            const root = document.querySelector('[data-testid="scan-flow"]')
            const backgroundControl = document.querySelector('[data-testid="open-add-expense"]')
            const applicationRoot = Array.from(document.body.children).find(
                (element): element is HTMLElement =>
                    element instanceof HTMLElement &&
                    element !== root &&
                    Boolean(backgroundControl && element.contains(backgroundControl))
            )
            return applicationRoot?.inert ?? false
        })
    ).toBe(true)

    // A BFCache trip suspends the old stream and asks for a fresh one. The
    // restored page must never show an enabled shutter over stopped tracks.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    await expect(page.getByTestId('scan-shutter')).toBeDisabled()
    await expect
        .poll(() =>
            page.evaluate(
                () => (window as typeof window & { __scanCameraE2E?: { stops: number } }).__scanCameraE2E?.stops
            )
        )
        .toBe(1)
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await expect(page.getByTestId('scan-shutter')).toBeEnabled()
    await expect
        .poll(() =>
            page.evaluate(
                () => (window as typeof window & { __scanCameraE2E?: { calls: number } }).__scanCameraE2E?.calls
            )
        )
        .toBe(2)

    await page.keyboard.press('Escape')
    await expect(flow).toHaveCount(0)
    await expect(page.getByTestId('expense-description')).toHaveValue('Draft dinner', { timeout: 15_000 })
    await expect(page.getByTestId('expense-amount')).toHaveValue('19.20')
    // The scanner hands control back to a newly opened Drawer instance. Its
    // own autofocus may choose the first field rather than the remounted scan
    // button; what must not happen is dropping focus onto body/background.
    await expect
        .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="expense-drawer"]'))))
        .toBe(true)
    await expect
        .poll(() =>
            page.evaluate(() => {
                const probe = (window as typeof window & { __scanCameraE2E?: { calls: number; stops: number } })
                    .__scanCameraE2E
                return probe ? { calls: probe.calls, stops: probe.stops } : null
            })
        )
        .toEqual({ calls: 2, stops: 2 })
    expect(posted.calls ?? 0).toBe(0)
})

test('camera shutter produces one JPEG parse request and releases the stream', async ({ page }) => {
    await mockCamera(page, 'ready')
    const posted: Posted = {}
    await stubTheModel(page, posted)
    await makeRoom(page, 'Shutter trip')
    await openScanner(page)

    await expect(page.getByTestId('scan-shutter')).toBeEnabled()
    await page.getByTestId('scan-shutter').click()
    await expect(page.getByTestId('scan-item-label').first()).toBeVisible({ timeout: 15_000 })

    expect(posted.calls).toBe(1)
    expect(posted.bodies).toHaveLength(1)
    expect(posted.mimeType).toBe('image/jpeg')
    expect(posted.imageBase64?.startsWith('data:')).toBe(false)
    expect((posted.imageBase64 ?? '').length).toBeGreaterThan(0)
    await expect
        .poll(() =>
            page.evaluate(
                () => (window as typeof window & { __scanCameraE2E?: { stops: number } }).__scanCameraE2E?.stops
            )
        )
        .toBe(1)
})

test('pagehide invalidates pending camera permission and pageshow requests a fresh stream', async ({ page }) => {
    await mockCamera(page, 'pending')
    const posted: Posted = {}
    await stubTheModel(page, posted)
    await makeRoom(page, 'Camera lifecycle trip')
    await openScanner(page)

    const cameraProbe = () =>
        page.evaluate(() => {
            const probe = (
                window as typeof window & {
                    __scanCameraE2E?: { calls: number; stops: number; resolveNext: () => void }
                }
            ).__scanCameraE2E
            return probe ? { calls: probe.calls, stops: probe.stops } : null
        })

    await expect.poll(cameraProbe).toEqual({ calls: 1, stops: 0 })
    await page.evaluate(() => {
        const probe = (
            window as typeof window & {
                __scanCameraE2E?: { resolveNext: () => void }
            }
        ).__scanCameraE2E
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
        probe?.resolveNext()
    })
    await expect.poll(cameraProbe).toEqual({ calls: 1, stops: 1 })
    await expect(page.getByTestId('scan-shutter')).toBeDisabled()

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await expect.poll(cameraProbe).toEqual({ calls: 2, stops: 1 })
    await page.evaluate(() => {
        ;(
            window as typeof window & {
                __scanCameraE2E?: { resolveNext: () => void }
            }
        ).__scanCameraE2E?.resolveNext()
    })
    await expect(page.getByTestId('scan-shutter')).toBeEnabled()
    await page.getByTestId('scan-close').click()
    await expect.poll(cameraProbe).toEqual({ calls: 2, stops: 2 })
    expect(posted.calls ?? 0).toBe(0)
})

test('permission denial leaves upload usable and sends no image before that explicit choice', async ({ page }) => {
    await mockCamera(page, 'denied')
    const posted: Posted = {}
    await stubTheModel(page, posted)
    await makeRoom(page, 'Fallback trip')
    await openScanner(page)

    const camera = page.getByTestId('scan-camera')
    await expect(camera.getByRole('status')).toContainText('Camera access is off')
    await expect(page.getByTestId('scan-shutter')).toBeDisabled()
    await expect(page.getByTestId('scan-upload')).toBeEnabled()
    await expect(page.locator('#scan-provider-terms')).toBeVisible()
    expect(posted.calls ?? 0).toBe(0)

    await pickPhoto(page)
    await expect(page.getByTestId('scan-item-label').first()).toBeVisible({ timeout: 15_000 })
    expect(posted.calls).toBe(1)
    expect(posted.mimeType).toBe('image/jpeg')
    expect(posted.imageBase64?.startsWith('data:')).toBe(false)
    expect((posted.imageBase64 ?? '').length).toBeGreaterThan(0)

    await page.getByTestId('scan-close').click()
    await expect(page.getByTestId('scan-flow')).toHaveCount(0)
    await expect(page.getByTestId('expense-amount')).toBeVisible({ timeout: 15_000 })
})

test('cancel during a delayed read restores the draft and a late response cannot resurrect the scanner', async ({
    page,
}) => {
    await mockCamera(page, 'denied')
    const posted: Posted = {}
    await stubTheModel(page, posted, { responses: [{ delayMs: 800 }] })
    const getExpensePosts = expensePostCount(page)
    await makeRoom(page, 'Slow receipt trip')

    await page.getByTestId('open-add-expense').click()
    await expect(page.getByTestId('scan-bill')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('expense-description').fill('Keep this draft')
    await page.getByTestId('expense-amount').fill('27')
    await page.getByTestId('scan-bill').click()
    await expect(page.getByTestId('scan-camera')).toBeVisible()
    await pickPhoto(page)
    await expect.poll(() => posted.calls ?? 0).toBe(1)

    await page.getByTestId('scan-close').click()
    await expect(page.getByTestId('scan-flow')).toHaveCount(0)
    await expect(page.getByTestId('expense-description')).toHaveValue('Keep this draft', { timeout: 15_000 })
    // Opening the scanner blurs the money field, so the ordinary drawer
    // normalisation still runs; preserving the draft means preserving its value,
    // not bypassing the locale-aware two-decimal display.
    await expect(page.getByTestId('expense-amount')).toHaveValue('27.00')
    await page.waitForTimeout(1_000)
    await expect(page.getByTestId('scan-flow')).toHaveCount(0)
    await expect(page.getByTestId('expense-description')).toHaveValue('Keep this draft')
    expect(getExpensePosts()).toBe(0)
})

test('a failed read can retry with another photo and calls the model once per attempt', async ({ page }) => {
    await mockCamera(page, 'denied')
    const posted: Posted = {}
    await stubTheModel(page, posted, {
        responses: [
            {
                status: 502,
                json: { error: { code: 'RECEIPT_PARSE_FAILED', message: 'Could not read this receipt' } },
            },
            { json: PARSED },
        ],
    })
    await makeRoom(page, 'Retry trip')
    await startUploadScan(page)

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('scan-retry')).toBeVisible()
    expect(posted.calls).toBe(1)
    await page.getByTestId('scan-retry').click()
    await expect(page.getByTestId('scan-camera')).toBeVisible()
    await expect(page.getByTestId('scan-upload')).toBeEnabled()
    await pickPhoto(page)

    await expect(page.getByTestId('scan-item-label').first()).toBeVisible({ timeout: 15_000 })
    expect(posted.calls).toBe(2)
    expect(posted.bodies).toHaveLength(2)
})

test('scan → review → assign → delete a hallucinated row → hand back → save once', async ({ page }) => {
    await mockCamera(page, 'denied')
    const posted: Posted = {}
    await stubTheModel(page, posted)
    const getExpensePosts = expensePostCount(page)
    await makeRoom(page, 'Scan trip')
    await startUploadScan(page)

    await expect(page.getByTestId('scan-item-label').first()).toBeVisible({ timeout: 15_000 })
    expect(posted.calls).toBe(1)
    expect(posted.mimeType).toBe('image/jpeg')
    expect(posted.imageBase64?.startsWith('data:')).toBe(false)
    expect((posted.imageBase64 ?? '').length).toBeGreaterThan(0)
    expect(await everythingOnScreenIsTheOverlay(page)).toEqual([])

    const firstLabel = page.getByTestId('scan-item-label').first()
    await firstLabel.click()
    await expect(firstLabel).toBeFocused()
    await firstLabel.fill('Pizza margherita')
    await expect(firstLabel).toHaveValue('Pizza margherita')

    await expect(page.getByTestId('scan-item-amount')).toHaveCount(3)
    await expect(page.getByTestId('scan-totals')).toContainText('42.40')
    await page.getByTestId('scan-remove-item').nth(2).click()
    await expect(page.getByTestId('scan-item-amount')).toHaveCount(2)
    await expect(page.getByTestId('scan-totals')).toContainText('32.50')
    await expect(page.getByTestId('scan-continue')).toBeEnabled()

    await page.getByTestId('scan-continue').click()
    await expect(page.getByTestId('scan-assign-row')).toHaveCount(2)
    expect(await everythingOnScreenIsTheOverlay(page)).toEqual([])
    await page.getByTestId('scan-item-remove').nth(1).click()
    await expect(page.getByTestId('scan-assign-row')).toHaveCount(1)
    await page.getByTestId('scan-everyone').first().click()
    await expect(page.getByTestId('scan-unassigned')).toHaveCount(0)
    expect(getExpensePosts()).toBe(0)
    await page.getByTestId('scan-apply').click()

    await expect(page.getByTestId('scan-flow')).toHaveCount(0)
    await expect(page.getByTestId('expense-amount')).toHaveValue('12.50', { timeout: 15_000 })
    await expect(page.getByTestId('expense-description')).toHaveValue('Da Nino')
    expect(getExpensePosts()).toBe(0)

    await page.getByTestId('save-expense').scrollIntoViewIfNeeded()
    const saveIsReachable = await page.evaluate(() => {
        const save = document.querySelector('[data-testid="save-expense"]')
        if (!save) return false
        const box = save.getBoundingClientRect()
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        return !!hit && save.contains(hit)
    })
    expect(saveIsReachable).toBe(true)

    await page.getByTestId('save-expense').click()
    const row = page.locator('[data-testid="expense-row"][data-description="Da Nino"]:not([disabled])')
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row).toContainText('12.50')
    expect(getExpensePosts()).toBe(1)
    expect(posted.calls).toBe(1)
})

test('browser Back exits only the scanner, keeps the drawer draft, and reopening starts at camera', async ({
    page,
}) => {
    await mockCamera(page, 'denied')
    const posted: Posted = {}
    await stubTheModel(page, posted)
    await makeRoom(page, 'Back trip')

    await page.getByTestId('open-add-expense').click()
    await expect(page.getByTestId('scan-bill')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('expense-description').fill('Back-safe draft')
    await page.getByTestId('scan-bill').click()
    await expect(page.getByTestId('scan-camera')).toBeVisible()
    await page.goBack()

    await expect(page.getByTestId('scan-flow')).toHaveCount(0)
    await expect(page.getByTestId('expense-description')).toHaveValue('Back-safe draft', { timeout: 15_000 })
    expect(posted.calls ?? 0).toBe(0)
    await page.getByTestId('scan-bill').click()
    await expect(page.getByTestId('scan-camera')).toBeVisible()
    await expect(page.getByTestId('scan-item-label')).toHaveCount(0)
})
