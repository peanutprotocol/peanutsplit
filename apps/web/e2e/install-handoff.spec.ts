import { expect, type BrowserContext, type Page } from '@playwright/test'
import { test } from './fixtures'

const SECRET_COOKIE = '__Host-ps-install-handoff'
const READY_COOKIE = '__Host-ps-install-handoff-ready'

interface CreatedRoom {
    room: { slug: string; name: string }
    memberId: string
    memberToken: string
}

async function copyHandoffCookies(source: BrowserContext, target: BrowserContext): Promise<void> {
    const cookies = (await source.cookies()).filter(
        (cookie) => cookie.name === SECRET_COOKIE || cookie.name === READY_COOKIE
    )
    expect(cookies.map((cookie) => cookie.name).sort()).toEqual([READY_COOKIE, SECRET_COOKIE].sort())
    await target.addCookies(cookies)
}

async function modelStandaloneLaunch(page: Page): Promise<void> {
    await page.addInitScript(() => {
        Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true })
        const nativeMatchMedia = window.matchMedia.bind(window)
        window.matchMedia = (query: string) =>
            query.includes('display-mode: standalone')
                ? ({
                      matches: true,
                      media: query,
                      addEventListener() {},
                      removeEventListener() {},
                  } as MediaQueryList)
                : nativeMatchMedia(query)

        const probe = window as Window & { __installHandoffPaintedHome?: boolean }
        probe.__installHandoffPaintedHome = false
        new MutationObserver(() => {
            if (document.querySelector('[data-testid="app-home"]')) probe.__installHandoffPaintedHome = true
        }).observe(document, { childList: true, subtree: true })
    })
}

test('iOS cookie-only first launch restores and ACKs one room while a regular tab never redeems it', async ({
    page,
    request,
    newDevice,
}) => {
    test.setTimeout(60_000)

    const createdResponse = await request.post('/api/rooms', {
        data: { name: `Installed room ${Date.now()}`, currency: 'EUR', creatorName: 'Ana' },
    })
    expect(createdResponse.status()).toBe(201)
    const created = (await createdResponse.json()) as CreatedRoom

    // The source Safari context knows the room. Preparing is a same-origin
    // browser mutation so the hardened cookies land exactly where WebKit will
    // copy them at Add to Home Screen time.
    await page.goto('/app?manage=1')
    const prepared = await page.evaluate(
        async ({ slug, token }) => {
            const response = await fetch(`/api/rooms/${encodeURIComponent(slug)}/install-handoff`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Member-Token': token },
                body: '{}',
            })
            return { status: response.status, body: await response.json() }
        },
        { slug: created.room.slug, token: created.memberToken }
    )
    expect(prepared).toEqual({ status: 201, body: { prepared: true } })

    const sourceCookies = await page.context().cookies()
    expect(sourceCookies.find((cookie) => cookie.name === SECRET_COOKIE)).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
    })
    expect(sourceCookies.find((cookie) => cookie.name === READY_COOKIE)).toMatchObject({
        httpOnly: false,
        secure: true,
        sameSite: 'Strict',
        value: '1',
    })
    const appUrl = new URL('/app', page.url()).toString()

    // Holding the same copied cookies in an ordinary browser context is not
    // enough. Only a standalone `/app` boot is allowed to redeem.
    const regular = await newDevice()
    await copyHandoffCookies(page.context(), regular.context())
    await regular.goto(appUrl)
    await expect(regular.getByTestId('app-home')).toBeVisible()
    expect(
        await regular.evaluate(
            (slug) => ({
                recent: localStorage.getItem('ps:recent'),
                identity: localStorage.getItem(`ps:member:${slug}`),
            }),
            created.room.slug
        )
    ).toEqual({ recent: null, identity: null })

    // Model the installed storage container: cookies copied, DOM storage empty.
    const installed = await newDevice()
    await copyHandoffCookies(page.context(), installed.context())
    await modelStandaloneLaunch(installed)
    let releaseRedeem: (() => void) | undefined
    let noteRedeemStarted: (() => void) | undefined
    const redeemStarted = new Promise<void>((resolve) => {
        noteRedeemStarted = resolve
    })
    const redeemGate = new Promise<void>((resolve) => {
        releaseRedeem = resolve
    })
    let releaseAck: (() => void) | undefined
    let noteAckStarted: (() => void) | undefined
    const ackStarted = new Promise<void>((resolve) => {
        noteAckStarted = resolve
    })
    const ackGate = new Promise<void>((resolve) => {
        releaseAck = resolve
    })
    await installed.route('**/api/install-handoff', async (route) => {
        if (route.request().method() === 'POST') {
            noteRedeemStarted?.()
            await redeemGate
        } else if (route.request().method() === 'DELETE') {
            noteAckStarted?.()
            await ackGate
        }
        await route.continue()
    })
    await installed.goto(appUrl)
    await redeemStarted
    await expect(installed.getByTestId('app-boot')).toBeVisible()
    await expect(installed.getByRole('status')).toContainText('Split')
    releaseRedeem?.()
    await expect(installed).toHaveURL(new RegExp(`/r/${created.room.slug}$`), { timeout: 15_000 })
    await ackStarted

    const restored = await installed.evaluate((slug) => {
        const recent = JSON.parse(localStorage.getItem('ps:recent') ?? '[]') as Array<{ slug: string; name: string }>
        const identity = JSON.parse(localStorage.getItem(`ps:member:${slug}`) ?? 'null') as {
            memberId: string
            name: string
            token: string
        } | null
        return {
            recent,
            identity,
            paintedHome: (window as Window & { __installHandoffPaintedHome?: boolean }).__installHandoffPaintedHome,
        }
    }, created.room.slug)
    expect(restored.recent[0]).toMatchObject({ slug: created.room.slug, name: created.room.name })
    expect(restored.identity).toEqual({ memberId: created.memberId, name: 'Ana', token: created.memberToken })
    expect(restored.paintedHome).toBe(false)
    await expect(installed.getByTestId('join-gate')).toHaveCount(0)
    // Local persistence and navigation do not wait behind cleanup. Until the
    // idempotent ACK reaches the server, both cookies intentionally remain.
    expect(
        (await installed.context().cookies()).filter(
            (cookie) => cookie.name === SECRET_COOKIE || cookie.name === READY_COOKIE
        )
    ).toHaveLength(2)
    const ackResponse = installed.waitForResponse(
        (response) => response.request().method() === 'DELETE' && response.url().endsWith('/api/install-handoff')
    )
    releaseAck?.()
    expect((await ackResponse).status()).toBe(204)
    await expect
        .poll(async () =>
            (await installed.context().cookies()).filter(
                (cookie) => cookie.name === SECRET_COOKIE || cookie.name === READY_COOKIE
            )
        )
        .toEqual([])

    // ACK physically consumed the transient row. Replaying the original copied
    // capability clears it and falls back without manufacturing room state.
    const replay = await newDevice()
    await copyHandoffCookies(page.context(), replay.context())
    await modelStandaloneLaunch(replay)
    await replay.goto(appUrl)
    await expect(replay.getByTestId('app-home')).toBeVisible({ timeout: 15_000 })
    await expect(replay).toHaveURL(/\/app$/)
    expect(await replay.evaluate(() => localStorage.getItem('ps:recent'))).toBeNull()
})
