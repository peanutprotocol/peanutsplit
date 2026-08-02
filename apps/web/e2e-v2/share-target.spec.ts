import { expect, test, type Page } from '@playwright/test'
import { makeRoom, snoozeInstallPrompt, stubTheModel, TINY_JPEG } from './helpers'

/**
 * A receipt photo handed in from the OS share sheet, on a build whose scan flow is on.
 *
 * WHAT THIS FILE CANNOT COVER, and why the seeding below is deliberate: `pnpm dev` builds no
 * service worker at all (next.config.js gates serwist on NODE_ENV), so the POST interception in
 * sw.ts — the step that actually parks the photo — is not reachable from Playwright in this repo.
 * These specs write into Cache Storage directly and cover everything downstream of a parked file:
 * the routing decision, the picker, the hand-off into the scan flow, and the promise that a photo
 * nobody claimed does not survive. The interception itself is on the real-device list, Android
 * only — Safari does not implement Web Share Target at all.
 */

const CACHE = 'ps:shared-receipt'
const KEY = '/__shared-receipt'

/** What the worker would have parked. The stamp matters: the boot sweep drops an entry with no
 *  stamp, and this asserts a fresh share survives it. */
const parkAReceipt = (page: Page) =>
    page.evaluate(
        async ([cache, key, bytes]) => {
            const store = await caches.open(cache as string)
            await store.put(
                key as string,
                new Response(new Uint8Array(bytes as number[]), {
                    headers: { 'content-type': 'image/jpeg', 'x-parked-at': String(Date.now()) },
                })
            )
        },
        [CACHE, KEY, Array.from(TINY_JPEG)] as const
    )

const parkedReceiptExists = (page: Page) =>
    page.evaluate(async ([cache, key]) => (await (await caches.open(cache)).match(key)) !== undefined, [
        CACHE,
        KEY,
    ] as const)

/** Two rooms in the recent list without paying for two room creations: only the real one is ever
 *  opened, and the decoy exists to make the picker a decision. */
const rememberDecoyRoom = (page: Page) =>
    page.evaluate(() => {
        const recent = JSON.parse(window.localStorage.getItem('ps:recent') ?? '[]') as unknown[]
        window.localStorage.setItem(
            'ps:recent',
            JSON.stringify([
                ...recent,
                { slug: 'old-trip-x7k2m9', name: 'Old trip', lastSeenAt: Date.now() - 86_400_000 },
            ])
        )
    })

test('the manifest offers Split to the OS share sheet, and still carries no room', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')
    const manifest = (await response.json()) as {
        id: string
        start_url: string
        scope: string
        share_target?: unknown
        shortcuts?: { url: string }[]
    }
    expect(manifest).toMatchObject({ id: '/', start_url: '/app', scope: '/' })

    expect(manifest.share_target).toEqual({
        action: '/api/share-target',
        method: 'POST',
        enctype: 'multipart/form-data',
        params: { files: [{ name: 'receipt', accept: ['image/*'] }] },
    })
    expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual(['/new', '/import'])
    expect(JSON.stringify(manifest)).not.toContain('/r/')
})

test('a share with no room to put it in offers to start one, and keeps nothing', async ({ page }) => {
    await snoozeInstallPrompt(page)
    await page.goto('/')
    await parkAReceipt(page)

    await page.goto('/share-target')

    await expect(page.getByTestId('share-target-start')).toHaveAttribute('href', '/new')
    expect(new URL(page.url()).pathname).toBe('/share-target')
    // Nothing to scan it with means nothing to keep it for.
    expect(await parkedReceiptExists(page)).toBe(false)
})

test('one room needs no decision, so the photo goes straight into its scan', async ({ page }) => {
    test.setTimeout(90_000)
    await stubTheModel(page, {})
    await makeRoom(page, 'Share trip')
    await parkAReceipt(page)

    await page.goto('/share-target')

    await page.waitForURL(/\/r\/share-trip-[^/]+\?add=1&shared=1/, { timeout: 15_000 })
    await expect(page.getByTestId('scan-flow')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('scan-item-label').first()).toBeVisible({ timeout: 15_000 })

    // Handed over exactly once: the cache is empty and the URL no longer advertises a share, so a
    // reload or a back button cannot start the same scan again.
    expect(await parkedReceiptExists(page)).toBe(false)
    await expect.poll(() => new URL(page.url()).search).not.toContain('shared=1')
})

test('two rooms is a decision, so the picker asks which bill this is', async ({ page }) => {
    test.setTimeout(90_000)
    await stubTheModel(page, {})
    await makeRoom(page, 'Picker trip')
    await rememberDecoyRoom(page)
    await parkAReceipt(page)

    await page.goto('/share-target')

    const rooms = page.getByTestId('share-target-room')
    await expect(rooms).toHaveCount(2)
    await expect(rooms.first()).toContainText('Picker trip')
    await expect(rooms.last()).toContainText('Old trip')

    await rooms.first().click()
    await page.waitForURL(/\/r\/picker-trip-[^/]+\?add=1&shared=1/, { timeout: 15_000 })
    await expect(page.getByTestId('scan-item-label').first()).toBeVisible({ timeout: 15_000 })
})

test('a share that did not arrive says so instead of opening an empty scan', async ({ page }) => {
    test.setTimeout(90_000)
    await stubTheModel(page, {})
    await makeRoom(page, 'Empty share trip')

    await page.goto('/share-target')

    await expect(page.getByText('That photo didn’t make it. Share it again.')).toBeVisible()
    await expect(page.getByTestId('share-target-open')).toHaveAttribute('href', '/app')
    expect(new URL(page.url()).pathname).toBe('/share-target')
})
