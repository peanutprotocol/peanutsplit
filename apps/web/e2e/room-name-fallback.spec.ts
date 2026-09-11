import { expect } from '@playwright/test'
import { test } from './fixtures'
import { draftRoomPeople, enterCreatedRoom } from './helpers'
import { ROOM_NAME_FALLBACKS } from '../src/lib/room-names'
import { slugStem } from '../src/lib/slugify'

test.setTimeout(60_000)

for (const door of ['new', 'hero'] as const) {
    for (const draft of ['', '   ']) {
        test(`${door}: ${draft ? 'whitespace' : 'blank'} room name gets a saved group name`, async ({ page }) => {
            const prefix = door === 'hero' ? 'hero-' : ''
            await page.goto(door === 'hero' ? '/' : '/new')
            const roomName = page.getByTestId(`${prefix}room-name`)
            await expect(roomName).toHaveValue('')
            await expect(roomName).not.toHaveAttribute('placeholder', /optional/i)
            if (draft) await roomName.fill(draft)
            await page.getByTestId(`${prefix}creator-name`).fill('Ana')
            await draftRoomPeople(page, ['Bea'])
            await page.getByTestId(`${prefix}create-room`).click()
            await enterCreatedRoom(page)

            const title = await page.getByTestId('room-title').innerText()
            expect(ROOM_NAME_FALLBACKS).toContain(title)
            const slug = new URL(page.url()).pathname.split('/')[2]
            expect(slug).toMatch(new RegExp(`^${slugStem(title)}-[A-Za-z0-9_-]{22}$`))

            const response = await page.request.get(`/api/rooms/${slug}`)
            expect(response.ok()).toBe(true)
            const state = await response.json()
            expect(state.room.name).toBe(title)
            expect(state.members.map((member: { name: string }) => member.name)).toEqual(['Ana', 'Bea'])

            await page.reload()
            await expect(page.getByTestId('room-title')).toHaveText(title)
            await expect(page.getByTestId('join-gate')).toHaveCount(0)
        })
    }
}
