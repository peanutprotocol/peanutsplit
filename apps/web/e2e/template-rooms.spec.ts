import { expect } from '@playwright/test'
import { test } from './fixtures'
import { TEMPLATES, templatePath } from '../src/templates/registry'
import { TEMPLATE_CTA_LABEL } from '../src/templates/shared'
import { enterCreatedRoom } from './helpers'

/**
 * The template link end to end: a page pasted into somebody else's community, the prefill it
 * carries, and the room it actually opens.
 *
 * The unit tests prove the href is built correctly. What only a browser can prove is that the
 * composer arrives holding it, that the one field a link may not fill in is the one waiting for
 * the cursor, and that the room comes out with the name the page promised.
 */
const TEMPLATE = TEMPLATES.find((entry) => entry.slug === 'villa-week')!

test.describe('template rooms', () => {
    test('opens a room already named, carrying the campaign it arrived on', async ({ page }) => {
        await page.goto(`${templatePath(TEMPLATE)}?utm_source=reddit&utm_medium=community`)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(TEMPLATE.copy.h1)

        const cta = page.getByRole('link', { name: TEMPLATE_CTA_LABEL }).first()
        const href = await cta.getAttribute('href')
        expect(href).toContain('name=Villa+week')
        expect(href).toContain('emblem=island')
        expect(href).toContain('template=villa-week')
        // The page was arrived at from a post; the room it opens belongs to that post.
        expect(href).toContain('utm_source=reddit')

        await cta.click()
        await expect(page.getByTestId('room-name')).toHaveValue(TEMPLATE.room.name)
        // The creator's name is the only thing a link may never fill in, so it takes the cursor.
        await expect(page.getByTestId('creator-name')).toBeFocused()

        await page.getByTestId('creator-name').fill('Bea')
        await page.getByTestId('create-room').click()
        await enterCreatedRoom(page)
        await expect(page.getByText(TEMPLATE.room.name).first()).toBeVisible()
    })

    test('lists every template on the hub and 404s anything else', async ({ page }) => {
        await page.goto('/t')
        for (const template of TEMPLATES) {
            await expect(page.getByRole('link', { name: new RegExp(template.meta.title, 'i') })).toBeVisible()
        }

        const missing = await page.goto('/t/no-such-template')
        expect(missing?.status()).toBe(404)
    })
})
