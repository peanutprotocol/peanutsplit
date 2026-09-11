import { expect, type Page, type Request } from '@playwright/test'
import { test } from './fixtures'
import { draftRoomPeople, enterCreatedRoom } from './helpers'
import { memberStorageKey } from '../src/lib/identity'

test.setTimeout(60_000)

const isRoomWrite = (request: Request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/rooms'

async function roomMembers(page: Page): Promise<Array<{ id: string; name: string }>> {
    const slug = new URL(page.url()).pathname.split('/')[2]
    const response = await page.request.get(`/api/rooms/${slug}`)
    expect(response.ok()).toBe(true)
    return (await response.json()).members
}

for (const door of ['new', 'hero'] as const) {
    const path = door === 'hero' ? '/' : '/new'
    const prefix = door === 'hero' ? 'hero-' : ''
    const setup = async (page: Page, title: string) => {
        await page.goto(path)
        await page.getByTestId(`${prefix}room-name`).fill(title)
        await page.getByTestId(`${prefix}creator-name`).fill('Ana')
        await page.getByTestId(`${prefix}room-name`).fill(title)
        await expect(page.getByTestId('room-person-name')).toHaveCount(1)
        await expect(page.getByTestId('room-person-name')).toHaveValue('')
        await expect(page.getByTestId('add-room-person')).toHaveAccessibleName('Add another person')
    }

    test.describe(() => {
        // A controlling service worker bypasses Playwright response interception in WebKit.
        test.use({ serviceWorkers: 'block' })

        test(`${door}: one explicit creation includes every name, including the last typed name`, async ({ page }) => {
            await setup(page, `Whole group ${door} ${Date.now()}`)
            let writes = 0
            let memberWrites = 0
            page.on('request', (request) => {
                if (isRoomWrite(request)) writes += 1
                if (
                    request.method() === 'POST' &&
                    /\/api\/rooms\/[^/]+\/members$/.test(new URL(request.url()).pathname)
                ) {
                    memberWrites += 1
                }
            })
            await draftRoomPeople(page, ['  Bea  ', 'Cass', 'Dana'])
            expect(writes).toBe(0)
            expect(memberWrites).toBe(0)

            let releaseWrite!: () => void
            const heldWrite = new Promise<void>((resolve) => {
                releaseWrite = resolve
            })
            let observeWrite!: () => void
            const writeStarted = new Promise<void>((resolve) => {
                observeWrite = resolve
            })
            let submittedBody: Record<string, unknown> | undefined
            await page.route('**/api/rooms', async (route) => {
                if (!isRoomWrite(route.request())) return route.continue()
                submittedBody = route.request().postDataJSON()
                observeWrite()
                await heldWrite
                await route.continue()
            })

            const create = page.getByTestId(`${prefix}create-room`)
            await create.click()
            await writeStarted
            try {
                expect(new URL(page.url()).pathname).toBe(path)
                await expect(create).toBeDisabled()
                await expect(page.getByTestId('room-person-name').last()).toHaveValue('Dana')
                expect(submittedBody).toMatchObject({ creatorName: 'Ana', memberNames: ['Bea', 'Cass', 'Dana'] })
                expect(writes).toBe(1)
            } finally {
                releaseWrite()
            }

            await enterCreatedRoom(page)
            await expect(page.getByTestId('roster-checkpoint')).toHaveCount(0)
            const members = await roomMembers(page)
            expect(members.map((member) => member.name)).toEqual(['Ana', 'Bea', 'Cass', 'Dana'])
            const slug = new URL(page.url()).pathname.split('/')[2]
            const identity = await page.evaluate(
                (key) => JSON.parse(localStorage.getItem(key)!),
                memberStorageKey(slug)
            )
            expect(identity).toMatchObject({ memberId: members[0].id, name: 'Ana' })
            expect(identity.token).toEqual(expect.any(String))
            expect(writes).toBe(1)
            expect(memberWrites).toBe(0)
        })

        test(`${door}: failed creation retains the entire draft and retry creates it once`, async ({ page }) => {
            const title = `Retry group ${door} ${Date.now()}`
            await setup(page, title)
            await draftRoomPeople(page, ['Bea', 'Cass'])
            let attempts = 0
            await page.route('**/api/rooms', async (route) => {
                if (!isRoomWrite(route.request())) return route.continue()
                attempts += 1
                if (attempts > 1) return route.continue()
                await route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        error: { code: 'INTERNAL_ERROR', message: 'Please try creating the room again.' },
                    }),
                })
            })
            const create = page.getByTestId(`${prefix}create-room`)
            await create.click()
            await expect(page.locator('form').filter({ has: create }).getByRole('alert')).toBeVisible()
            await expect(create).toBeEnabled()
            expect(new URL(page.url()).pathname).toBe(path)
            await expect(page.getByTestId(`${prefix}room-name`)).toHaveValue(title)
            await expect(page.getByTestId(`${prefix}creator-name`)).toHaveValue('Ana')
            await expect(page.getByTestId('room-person-name').nth(0)).toHaveValue('Bea')
            await expect(page.getByTestId('room-person-name').nth(1)).toHaveValue('Cass')
            expect(attempts).toBe(1)

            await create.click()
            await enterCreatedRoom(page)
            expect((await roomMembers(page)).map((member) => member.name)).toEqual(['Ana', 'Bea', 'Cass'])
            expect(attempts).toBe(2)
        })
    })

    test(`${door}: Enter keeps adding people in setup without creating the room`, async ({ page }) => {
        await setup(page, `Keyboard group ${door} ${Date.now()}`)
        const writes: Request[] = []
        page.on('request', (request) => {
            if (isRoomWrite(request)) writes.push(request)
        })
        await page.getByTestId(`${prefix}room-name`).press('Enter')
        await expect(page.getByTestId(`${prefix}creator-name`)).toBeFocused()
        await page.getByTestId(`${prefix}creator-name`).press('Enter')
        await expect(page.getByTestId('room-person-name').first()).toBeFocused()
        await page.getByTestId('room-person-name').first().fill('Bea')
        await page.getByTestId('room-person-name').first().press('Enter')
        await expect(page.getByTestId('room-person-name')).toHaveCount(2)
        await expect(page.getByTestId('room-person-name').last()).toBeFocused()
        await page.getByTestId('room-person-name').last().fill('Cass')
        expect(new URL(page.url()).pathname).toBe(path)
        expect(writes).toHaveLength(0)

        await page.getByTestId(`${prefix}create-room`).click()
        await enterCreatedRoom(page)
        expect((await roomMembers(page)).map((member) => member.name)).toEqual(['Ana', 'Bea', 'Cass'])
        expect(writes).toHaveLength(1)
    })

    test(`${door}: duplicate people remain editable until their names are distinct`, async ({ page }) => {
        await setup(page, `Distinct group ${door} ${Date.now()}`)
        await draftRoomPeople(page, [' ana ', 'Bea'])
        const create = page.getByTestId(`${prefix}create-room`)
        await create.click()
        await expect(page.getByTestId('room-people').getByRole('alert')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(path)
        await expect(page.getByTestId('room-person-name').nth(0)).toHaveValue(' ana ')

        await page.getByTestId('room-person-name').nth(0).fill(' bea ')
        await create.click()
        await expect(page.getByTestId('room-people').getByRole('alert')).toBeVisible()
        expect(new URL(page.url()).pathname).toBe(path)
        await page.getByTestId('room-person-name').nth(0).fill('Cass')
        await create.click()
        await enterCreatedRoom(page)
        expect((await roomMembers(page)).map((member) => member.name)).toEqual(['Ana', 'Cass', 'Bea'])
    })

    test(`${door}: removing a draft person preserves the other names and blank rows are optional`, async ({ page }) => {
        await setup(page, `Edited group ${door} ${Date.now()}`)
        await draftRoomPeople(page, ['Bea', 'Cass', 'Dana'])
        await page.getByTestId('remove-room-person').nth(1).click()
        await expect(page.getByTestId('room-person-name')).toHaveCount(2)
        await expect(page.getByTestId('room-person-name').nth(0)).toHaveValue('Bea')
        await expect(page.getByTestId('room-person-name').nth(1)).toHaveValue('Dana')
        await page.getByTestId('add-room-person').click()
        await expect(page.getByTestId('room-person-name').last()).toHaveValue('')
        await page.getByTestId(`${prefix}create-room`).click()
        await enterCreatedRoom(page)
        expect((await roomMembers(page)).map((member) => member.name)).toEqual(['Ana', 'Bea', 'Dana'])
    })

    test(`${door}: a room can be created with only its creator`, async ({ page }) => {
        await setup(page, `Solo group ${door} ${Date.now()}`)
        await page.getByTestId(`${prefix}create-room`).click()
        await enterCreatedRoom(page)
        expect((await roomMembers(page)).map((member) => member.name)).toEqual(['Ana'])
    })

    test(`${door}: a long people draft works in a short mobile viewport`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 400 })
        await setup(page, `Large group ${door} ${Date.now()}`)
        const names = Array.from({ length: 19 }, (_, index) => `Friend ${index + 1}`)
        await draftRoomPeople(page, names)
        const lastName = page.getByTestId('room-person-name').last()
        await expect(lastName).toBeFocused()
        await expect(lastName).toBeInViewport({ ratio: 1 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const create = page.getByTestId(`${prefix}create-room`)
        await create.scrollIntoViewIfNeeded()
        await expect(create).toBeInViewport({ ratio: 1 })
        await create.click()
        await enterCreatedRoom(page)
        expect((await roomMembers(page)).map((member) => member.name)).toEqual(['Ana', ...names])
    })
}
