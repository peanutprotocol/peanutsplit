import { expect, test } from '@playwright/test'

const OLDER_SLUG = 'older-trip-calm-river-piano'
const NEWEST_SLUG = 'newest-trip-brave-otter-lamp'

test('the app entry replaces itself with the newest valid saved room', async ({ page }) => {
    await page.addInitScript(() => {
        const windowWithProbe = window as typeof window & { __sawAppHome?: boolean }
        windowWithProbe.__sawAppHome = false
        const detectAppHome = () => {
            if (document.querySelector('[data-testid="app-home"]')) windowWithProbe.__sawAppHome = true
        }
        new MutationObserver(detectAppHome).observe(document, { childList: true, subtree: true })
    })

    // Give Back a real page to return to. `/app` must replace this history entry,
    // not leave an intermediate chooser that immediately redirects again.
    await page.goto('/new')
    await page.evaluate(
        ({ newestSlug, olderSlug }) => {
            localStorage.setItem(
                'ps:recent',
                JSON.stringify([
                    { slug: olderSlug, name: 'Older room', lastSeenAt: 10 },
                    { slug: '../../new', name: 'Tampered room', lastSeenAt: 30 },
                    { slug: newestSlug, name: 'Newest room', lastSeenAt: 20 },
                ])
            )
        },
        { newestSlug: NEWEST_SLUG, olderSlug: OLDER_SLUG }
    )

    await page.goto('/app')
    await expect(page).toHaveURL(new RegExp(`/r/${NEWEST_SLUG}$`))
    expect(await page.evaluate(() => (window as typeof window & { __sawAppHome?: boolean }).__sawAppHome)).toBe(false)

    await page.goBack()
    await expect(page).toHaveURL(/\/new$/)
})

test('the app entry reveals the existing usable home when no room is saved', async ({ page }) => {
    await page.goto('/app')

    await expect(page.getByTestId('app-home')).toBeVisible()
    await expect(page.getByTestId('app-new-split')).toHaveAttribute('href', '/new')
    await expect(page.getByTestId('app-import')).toHaveAttribute('href', '/import')
    await expect(page.getByTestId('room-link-recovery')).toBeVisible()
    await expect(page).toHaveURL(/\/app$/)
})

test('explicit room options remain reachable when a saved room would normally resume', async ({ page }) => {
    await page.goto('/new')
    await page.evaluate((slug) => {
        localStorage.setItem('ps:recent', JSON.stringify([{ slug, name: 'Saved room', lastSeenAt: Date.now() }]))
    }, NEWEST_SLUG)

    await page.goto('/app?manage=1')

    await expect(page.getByTestId('app-home')).toBeVisible()
    await expect(page.getByTestId('app-new-split')).toHaveAttribute('href', '/new')
    await expect(page.getByTestId('app-import')).toHaveAttribute('href', '/import')
    await expect(page.getByTestId('room-link-recovery')).toBeVisible()
    await expect(page).toHaveURL(/\/app\?manage=1$/)
})
