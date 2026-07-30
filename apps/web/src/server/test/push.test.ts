/**
 * Push tests: the real route handlers and the real send pipeline against the
 * real test database. The ONLY thing stubbed is `webpush.sendNotification` —
 * the network boundary. Mocking Prisma here would mean testing the mock, and
 * every rule this file exists to protect (the dedupe claim, the daily cap, dead
 * endpoint pruning) is a database rule.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma, truncateAll } from '@/server/test/db'
import { resetRateLimits } from '@/server/rateLimit'
import { claimSend, isAllSettled, resetPushConfig, sendRoomEvent, utcDayKey } from '@/server/push'
import { allSettledPayload, expenseAddedPayload } from '@/server/notifyCopy'
import { loadRoom, toRoomState } from '@/server/roomState'
import { POST as postRoom } from '@/app/api/rooms/route'
import { POST as postMember } from '@/app/api/rooms/[slug]/members/route'
import { POST as postExpense } from '@/app/api/rooms/[slug]/expenses/route'
import { DELETE as deleteSubscription, POST as postSubscription } from '@/app/api/rooms/[slug]/push-subscriptions/route'
import { POST as postSubscriptionStatus } from '@/app/api/rooms/[slug]/push-subscriptions/status/route'
import { POST as postOpened } from '@/app/api/push/opened/route'
import { POST as postDismissed } from '@/app/api/push/dismissed/route'
import type { RoomStateWithMember } from '@/lib/api-types'

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }))

vi.mock('web-push', async (importOriginal) => {
    const actual = (await importOriginal()) as typeof import('web-push')
    return {
        ...actual,
        // The real WebPushError stays — the pipeline branches on it, so a fake
        // one would test a different `instanceof`.
        default: { setVapidDetails: vi.fn(), sendNotification },
    }
})

const { WebPushError } = await import('web-push')

const BASE = 'http://localhost'
const FCM = (id: string) => `https://fcm.googleapis.com/fcm/send/${id}`

type Params = Record<string, string>
type Handler = (request: Request, ctx: { params: Promise<Params> }) => Promise<Response>

const call = async <T>(
    handler: Handler,
    opts: { path: string; method?: string; body?: unknown; params?: Params }
): Promise<{ status: number; body: T }> => {
    const request = new Request(`${BASE}${opts.path}`, {
        method: opts.method ?? 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
    const res = await handler(request, { params: Promise.resolve(opts.params ?? {}) })
    return { status: res.status, body: (await res.json().catch(() => null)) as T }
}

interface Fixture {
    slug: string
    roomId: string
    owner: { id: string; token: string }
    friend: { id: string; token: string }
}

async function makeRoom(): Promise<Fixture> {
    const created = await call<RoomStateWithMember>(postRoom as Handler, {
        path: '/api/rooms',
        method: 'POST',
        body: { name: 'Ski Trip', emoji: '🎿', currency: 'EUR', creatorName: 'Ana' },
    })
    const slug = created.body.room.slug
    const joined = await call<RoomStateWithMember>(postMember as Handler, {
        path: `/api/rooms/${slug}/members`,
        method: 'POST',
        params: { slug },
        body: { name: 'Bruno' },
    })
    return {
        slug,
        roomId: created.body.room.id,
        owner: { id: created.body.memberId, token: created.body.memberToken },
        friend: { id: joined.body.memberId, token: joined.body.memberToken },
    }
}

const subscribe = (fixture: Fixture, member: { id: string; token: string }, endpoint: string, extra = {}) =>
    call<{ subscribed: boolean } | { error: { code: string } }>(postSubscription as Handler, {
        path: `/api/rooms/${fixture.slug}/push-subscriptions`,
        method: 'POST',
        params: { slug: fixture.slug },
        body: {
            endpoint,
            keys: { p256dh: 'BPk3p256dhKeyMaterial', auth: 'authKeyMaterial' },
            memberId: member.id,
            memberToken: member.token,
            ...extra,
        },
    })

const unsubscribe = (fixture: Fixture, member: { id: string; token: string }, endpoint: string) =>
    call<{ subscribed: false; endpointStillUsed: boolean }>(deleteSubscription as Handler, {
        path: `/api/rooms/${fixture.slug}/push-subscriptions`,
        method: 'DELETE',
        params: { slug: fixture.slug },
        body: { endpoint, memberId: member.id, memberToken: member.token },
    })

const askStatus = (fixture: Fixture, member: { id: string; token: string }, endpoint: string) =>
    call<{ subscribed: boolean } | { error: { code: string } }>(postSubscriptionStatus as Handler, {
        path: `/api/rooms/${fixture.slug}/push-subscriptions/status`,
        method: 'POST',
        params: { slug: fixture.slug },
        body: { endpoint, memberId: member.id, memberToken: member.token },
    })

/** Seed a channel without going through the endpoint, for the pipeline tests. */
const seedSubscription = (roomId: string, memberId: string, endpoint: string) =>
    prisma.pushSubscription.create({
        data: { roomId, memberId, endpoint, p256dh: 'p256dh', auth: 'auth' },
    })

beforeAll(() => {
    // Any non-empty values will do: setVapidDetails is the stub.
    process.env.SPLIT_VAPID_PUBLIC_KEY = 'test-public'
    process.env.SPLIT_VAPID_PRIVATE_KEY = 'test-private'
    process.env.SPLIT_VAPID_SUBJECT = 'mailto:test@peanut.me'
})

beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    resetPushConfig()
    sendNotification.mockReset()
    sendNotification.mockResolvedValue({ statusCode: 201 })
})

describe('subscribe endpoint', () => {
    it('registers a channel for a member who proves their token', async () => {
        const fixture = await makeRoom()
        const { status } = await subscribe(fixture, fixture.owner, FCM('a'))
        expect(status).toBe(201)

        const rows = await prisma.pushSubscription.findMany()
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ roomId: fixture.roomId, memberId: fixture.owner.id })
    })

    it('refuses a link-holder who cannot produce the member token', async () => {
        const fixture = await makeRoom()
        const { status, body } = await subscribe(fixture, { id: fixture.owner.id, token: 'not-the-token' }, FCM('a'))
        expect(status).toBe(403)
        expect(body).toMatchObject({ error: { code: 'MEMBER_TOKEN_INVALID' } })
        expect(await prisma.pushSubscription.count()).toBe(0)
    })

    it('refuses a member id that is not in this room', async () => {
        const fixture = await makeRoom()
        const { status } = await subscribe(fixture, { id: 'someone-else', token: fixture.owner.token }, FCM('a'))
        expect(status).toBe(403)
    })

    it('rejects an endpoint outside the push-service allowlist', async () => {
        const fixture = await makeRoom()
        const { status, body } = await subscribe(fixture, fixture.owner, 'https://attacker.example.com/hook')
        expect(status).toBe(400)
        expect(body).toMatchObject({ error: { code: 'UNSUPPORTED_PUSH_HOST' } })
        expect(await prisma.pushSubscription.count()).toBe(0)
    })

    it('upserts on (endpoint, room) so rotated keys replace the row instead of piling up', async () => {
        const fixture = await makeRoom()
        await subscribe(fixture, fixture.owner, FCM('a'))
        await subscribe(fixture, fixture.friend, FCM('a'), {
            keys: { p256dh: 'rotatedP256dh', auth: 'rotatedAuth' },
        })

        const rows = await prisma.pushSubscription.findMany()
        expect(rows).toHaveLength(1)
        expect(rows[0].p256dh).toBe('rotatedP256dh')
        expect(rows[0].memberId).toBe(fixture.friend.id)
    })

    it('lets one endpoint hold a channel in two different rooms', async () => {
        const first = await makeRoom()
        const second = await makeRoom()
        await subscribe(first, first.owner, FCM('shared'))
        await subscribe(second, second.owner, FCM('shared'))

        expect(await prisma.pushSubscription.count()).toBe(2)
    })

    it('caps a room at 30 devices', async () => {
        const fixture = await makeRoom()
        await prisma.pushSubscription.createMany({
            data: Array.from({ length: 30 }, (_, i) => ({
                roomId: fixture.roomId,
                memberId: fixture.owner.id,
                endpoint: FCM(`seed-${i}`),
                p256dh: 'p256dh',
                auth: 'auth',
            })),
        })

        const { status, body } = await subscribe(fixture, fixture.owner, FCM('one-too-many'))
        expect(status).toBe(429)
        expect(body).toMatchObject({ error: { code: 'PUSH_SUBSCRIPTION_LIMIT' } })

        // A device already at the table can still refresh its keys.
        expect((await subscribe(fixture, fixture.owner, FCM('seed-0'))).status).toBe(201)
    })

    it('keeps the 30-device cap under concurrent subscriptions', async () => {
        const fixture = await makeRoom()
        await prisma.pushSubscription.createMany({
            data: Array.from({ length: 29 }, (_, i) => ({
                roomId: fixture.roomId,
                memberId: fixture.owner.id,
                endpoint: FCM(`seed-${i}`),
                p256dh: 'p256dh',
                auth: 'auth',
            })),
        })

        const results = await Promise.all(
            Array.from({ length: 6 }, (_, i) => subscribe(fixture, fixture.owner, FCM(`racer-${i}`)))
        )

        expect(results.filter(({ status }) => status === 201)).toHaveLength(1)
        expect(results.filter(({ status }) => status === 429)).toHaveLength(5)
        expect(await prisma.pushSubscription.count({ where: { roomId: fixture.roomId } })).toBe(30)
    })

    it('drops the channel on DELETE', async () => {
        const fixture = await makeRoom()
        await subscribe(fixture, fixture.owner, FCM('a'))

        const { status } = await unsubscribe(fixture, fixture.owner, FCM('a'))
        expect(status).toBe(200)
        expect(await prisma.pushSubscription.count()).toBe(0)
    })
})

describe('unsubscribe endpoint', () => {
    /** The client revokes the browser subscription on this answer, and that
     *  endpoint is the whole device's — every other room's row points at it. */
    it('says the endpoint is still used while another room holds it', async () => {
        const first = await makeRoom()
        const second = await makeRoom()
        await subscribe(first, first.owner, FCM('shared'))
        await subscribe(second, second.owner, FCM('shared'))

        const { status, body } = await unsubscribe(first, first.owner, FCM('shared'))
        expect(status).toBe(200)
        expect(body).toEqual({ subscribed: false, endpointStillUsed: true })
        // The other room is untouched — this is the bug that took it dark.
        expect(await prisma.pushSubscription.count({ where: { roomId: second.roomId } })).toBe(1)
    })

    it('says the endpoint is free once the last room lets go of it', async () => {
        const fixture = await makeRoom()
        await subscribe(fixture, fixture.owner, FCM('only'))

        const { body } = await unsubscribe(fixture, fixture.owner, FCM('only'))
        expect(body).toEqual({ subscribed: false, endpointStillUsed: false })
        expect(await prisma.pushSubscription.count()).toBe(0)
    })

    it('is free of an endpoint this room never had, and says so', async () => {
        const fixture = await makeRoom()
        const { status, body } = await unsubscribe(fixture, fixture.owner, FCM('never-registered'))
        expect(status).toBe(200)
        expect(body).toEqual({ subscribed: false, endpointStillUsed: false })
    })
})

describe('status endpoint', () => {
    it('answers false for a room this endpoint was never registered for', async () => {
        const first = await makeRoom()
        const second = await makeRoom()
        // One device, two rooms, notifications on in the first only. Reading the
        // browser's own subscription here reported the second room as on too.
        await subscribe(first, first.owner, FCM('one-device'))

        expect((await askStatus(first, first.owner, FCM('one-device'))).body).toEqual({ subscribed: true })
        expect((await askStatus(second, second.owner, FCM('one-device'))).body).toEqual({ subscribed: false })
    })

    it('goes back to false after the channel is dropped', async () => {
        const fixture = await makeRoom()
        await subscribe(fixture, fixture.owner, FCM('a'))
        await unsubscribe(fixture, fixture.owner, FCM('a'))

        expect((await askStatus(fixture, fixture.owner, FCM('a'))).body).toEqual({ subscribed: false })
    })

    it('refuses a link-holder who cannot produce the member token', async () => {
        const fixture = await makeRoom()
        await subscribe(fixture, fixture.owner, FCM('a'))

        const { status, body } = await askStatus(fixture, { id: fixture.owner.id, token: 'not-the-token' }, FCM('a'))
        expect(status).toBe(403)
        expect(body).toMatchObject({ error: { code: 'MEMBER_TOKEN_INVALID' } })
    })

    /**
     * The oracle this route would otherwise widen: a guessed slug answers 404 and
     * a real slug with a bad token answers 403, so the two are distinguishable —
     * as often as the limiter allows. On its own 120/hour bucket that is four
     * times the 30/hour the miss limiter exists to enforce. Once the shared miss
     * budget is empty, a real slug has to 429 as well, or the rejection itself
     * tells the caller the room exists.
     */
    it('meters a guessed slug on the shared miss budget, not its own', async () => {
        const fixture = await makeRoom()

        for (let i = 0; i < 31; i++) {
            const missed = await askStatus({ ...fixture, slug: `missing-${i}` }, fixture.owner, FCM('a'))
            expect(missed.status).toBe(i < 30 ? 404 : 429)
        }

        const { status, body } = await askStatus(fixture, fixture.owner, FCM('a'))
        expect(status).toBe(429)
        expect(body).toMatchObject({ error: { code: 'RATE_LIMITED' } })

        // The sibling DELETE has the same 404/403 shape, and spends the same
        // budget — one route left on its own bucket would keep the oracle open.
        expect((await unsubscribe(fixture, fixture.owner, FCM('a'))).status).toBe(429)
    })

    /** Turning notifications off is the one thing still worth doing in an
     *  archived room, and the toggle cannot render without this answer. */
    it('still answers in an archived room', async () => {
        const fixture = await makeRoom()
        await subscribe(fixture, fixture.owner, FCM('a'))
        await prisma.room.update({ where: { id: fixture.roomId }, data: { archivedAt: new Date() } })

        const { status, body } = await askStatus(fixture, fixture.owner, FCM('a'))
        expect(status).toBe(200)
        expect(body).toEqual({ subscribed: true })
    })
})

describe('dedupe claim', () => {
    it('hands the slot to the first caller and nobody else', async () => {
        const fixture = await makeRoom()
        const claim = {
            roomId: fixture.roomId,
            template: 'all_settled' as const,
            dayKey: utcDayKey(),
            dedupeKey: `${fixture.roomId}:all_settled:${utcDayKey()}`,
        }
        expect(await claimSend(claim)).not.toBeNull()
        expect(await claimSend(claim)).toBeNull()
        expect(await prisma.notificationSend.count()).toBe(1)
    })

    it('rethrows anything that is not a uniqueness collision', async () => {
        // A room that does not exist — a foreign-key violation, not a P2002. A
        // blanket catch here would report "already sent" and blackhole the push.
        await expect(
            claimSend({
                roomId: 'no-such-room',
                template: 'all_settled',
                dayKey: utcDayKey(),
                dedupeKey: 'orphan:all_settled:today',
            })
        ).rejects.toThrow()
    })
})

describe('send pipeline', () => {
    const expenseEvent = async (fixture: Fixture, eventId: string) => {
        const room = await loadRoom(fixture.slug)
        return sendRoomEvent({
            room,
            template: 'expense_added',
            actorMemberId: fixture.owner.id,
            eventId,
            buildPayload: (sendId) =>
                expenseAddedPayload({
                    room,
                    roomId: room.id,
                    sendId,
                    actorName: 'Ana',
                    description: 'Lift passes',
                    amountMinor: '12000',
                    currency: 'EUR',
                }),
        })
    }

    it('no-ops with a loud warning when VAPID is unset', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const previous = process.env.SPLIT_VAPID_PUBLIC_KEY
        delete process.env.SPLIT_VAPID_PUBLIC_KEY
        resetPushConfig()

        const fixture = await makeRoom()
        await seedSubscription(fixture.roomId, fixture.friend.id, FCM('b'))
        expect(await expenseEvent(fixture, 'expense-1')).toEqual({ status: 'disabled' })
        expect(sendNotification).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalledWith('[split] push disabled: VAPID keys unset')

        process.env.SPLIT_VAPID_PUBLIC_KEY = previous
        resetPushConfig()
        warn.mockRestore()
    })

    it('never notifies the actor, and burns no dedupe slot when nobody is left', async () => {
        const fixture = await makeRoom()
        await seedSubscription(fixture.roomId, fixture.owner.id, FCM('own-device'))

        expect(await expenseEvent(fixture, 'expense-1')).toEqual({ status: 'skipped', reason: 'no-targets' })
        expect(sendNotification).not.toHaveBeenCalled()
        // The slot must still be free: the first person to subscribe should not
        // find this event already marked as sent.
        expect(await prisma.notificationSend.count()).toBe(0)
    })

    it('delivers to everyone else and records the send', async () => {
        const fixture = await makeRoom()
        await seedSubscription(fixture.roomId, fixture.owner.id, FCM('own-device'))
        await seedSubscription(fixture.roomId, fixture.friend.id, FCM('friend-phone'))

        expect(await expenseEvent(fixture, 'expense-1')).toEqual({ status: 'sent', delivered: 1, pruned: 0 })
        expect(sendNotification).toHaveBeenCalledTimes(1)

        const [subscription, payload, options] = sendNotification.mock.calls[0]
        expect(subscription.endpoint).toBe(FCM('friend-phone'))
        expect(JSON.parse(payload)).toMatchObject({
            body: 'Ana added Lift passes — €120.00',
            url: `/r/${fixture.slug}`,
            template: 'expense_added',
        })
        expect(options).toMatchObject({ TTL: 86_400, urgency: 'normal' })

        const ledger = await prisma.notificationSend.findMany()
        expect(ledger).toHaveLength(1)
        expect(ledger[0]).toMatchObject({ status: 'sent', template: 'expense_added' })
    })

    it('replays as a no-op — the same event never buzzes twice', async () => {
        const fixture = await makeRoom()
        await seedSubscription(fixture.roomId, fixture.friend.id, FCM('friend-phone'))

        await expenseEvent(fixture, 'expense-1')
        expect(await expenseEvent(fixture, 'expense-1')).toEqual({ status: 'skipped', reason: 'already-sent' })
        expect(sendNotification).toHaveBeenCalledTimes(1)
    })

    it('caps expense_added at three per room per day', async () => {
        const fixture = await makeRoom()
        await seedSubscription(fixture.roomId, fixture.friend.id, FCM('friend-phone'))

        for (const id of ['e1', 'e2', 'e3']) {
            expect((await expenseEvent(fixture, id)).status).toBe('sent')
        }
        expect(await expenseEvent(fixture, 'e4')).toEqual({ status: 'skipped', reason: 'daily-cap' })
        expect(sendNotification).toHaveBeenCalledTimes(3)
    })

    it('keeps the daily expense cap under concurrent sends', async () => {
        const fixture = await makeRoom()
        await seedSubscription(fixture.roomId, fixture.friend.id, FCM('friend-phone'))

        const results = await Promise.all(Array.from({ length: 8 }, (_, i) => expenseEvent(fixture, `race-${i}`)))

        expect(results.filter(({ status }) => status === 'sent')).toHaveLength(3)
        expect(results.filter(({ status }) => status === 'skipped')).toHaveLength(5)
        expect(sendNotification).toHaveBeenCalledTimes(3)
        expect(
            await prisma.notificationSend.count({
                where: { roomId: fixture.roomId, template: 'expense_added', dayKey: utcDayKey() },
            })
        ).toBe(3)
    })

    it('prunes an endpoint the push service says is gone, and keeps the live one', async () => {
        const fixture = await makeRoom()
        await seedSubscription(fixture.roomId, fixture.friend.id, FCM('dead-phone'))
        await seedSubscription(fixture.roomId, fixture.friend.id, FCM('live-phone'))

        sendNotification.mockImplementation(async (subscription: { endpoint: string }) => {
            if (subscription.endpoint === FCM('dead-phone')) {
                throw new WebPushError('gone', 410, {}, 'gone', subscription.endpoint)
            }
            return { statusCode: 201 }
        })

        expect(await expenseEvent(fixture, 'expense-1')).toEqual({ status: 'sent', delivered: 1, pruned: 1 })
        const left = await prisma.pushSubscription.findMany()
        expect(left.map((s) => s.endpoint)).toEqual([FCM('live-phone')])
    })

    it('keeps a channel that failed for any other reason, and marks the send failed', async () => {
        const fixture = await makeRoom()
        await seedSubscription(fixture.roomId, fixture.friend.id, FCM('friend-phone'))
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        sendNotification.mockRejectedValue(new WebPushError('boom', 500, {}, 'boom', FCM('friend-phone')))

        expect(await expenseEvent(fixture, 'expense-1')).toEqual({ status: 'failed', delivered: 0, pruned: 0 })
        expect(await prisma.pushSubscription.count()).toBe(1)
        expect((await prisma.notificationSend.findFirst())?.status).toBe('failed')
        vi.restoreAllMocks()
    })

    it('announces all-settled once a day, however many times it is detected', async () => {
        const fixture = await makeRoom()
        await seedSubscription(fixture.roomId, fixture.friend.id, FCM('friend-phone'))
        const room = await loadRoom(fixture.slug)
        const settled = () =>
            sendRoomEvent({
                room,
                template: 'all_settled',
                actorMemberId: fixture.owner.id,
                buildPayload: (sendId) => allSettledPayload({ room, roomId: room.id, sendId }),
            })

        expect((await settled()).status).toBe('sent')
        expect(await settled()).toEqual({ status: 'skipped', reason: 'already-sent' })
    })
})

describe('all-settled detection', () => {
    it('is false for an empty room and true once every balance is zero', async () => {
        const fixture = await makeRoom()
        expect(isAllSettled(toRoomState(await loadRoom(fixture.slug)))).toBe(false)

        await call(postExpense as Handler, {
            path: `/api/rooms/${fixture.slug}/expenses`,
            method: 'POST',
            params: { slug: fixture.slug },
            body: {
                description: 'Coffee',
                amountMinor: '400',
                currency: 'EUR',
                paidById: fixture.owner.id,
                splitMode: 'EQUAL',
                participantIds: [fixture.owner.id],
            },
        })
        // Paid by one person, split across that same person: spent, but square.
        expect(isAllSettled(toRoomState(await loadRoom(fixture.slug)))).toBe(true)
    })
})

describe('expense route wiring', () => {
    it('pushes to the other member when someone adds an expense', async () => {
        const fixture = await makeRoom()
        await seedSubscription(fixture.roomId, fixture.friend.id, FCM('friend-phone'))

        const request = new Request(`${BASE}/api/rooms/${fixture.slug}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Member-Token': fixture.owner.token },
            body: JSON.stringify({
                description: 'Lift passes',
                amountMinor: '12000',
                currency: 'EUR',
                paidById: fixture.owner.id,
                splitMode: 'EQUAL',
            }),
        })
        const res = await (postExpense as Handler)(request, { params: Promise.resolve({ slug: fixture.slug }) })
        expect(res.status).toBe(201)

        // The send is deliberately fire-and-forget, so the write is committed
        // before the notification is even attempted — poll for the ledger row.
        await waitFor(async () => (await prisma.notificationSend.count()) === 1)
        expect(sendNotification).toHaveBeenCalledTimes(1)
        expect(JSON.parse(sendNotification.mock.calls[0][1])).toMatchObject({
            body: 'Ana added Lift passes — €120.00',
            template: 'expense_added',
        })
    })

    it('never invents the payer as actor for a tokenless on-behalf expense', async () => {
        const fixture = await makeRoom()
        await seedSubscription(fixture.roomId, fixture.friend.id, FCM('friend-phone'))

        const request = new Request(`${BASE}/api/rooms/${fixture.slug}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description: 'Dinner',
                amountMinor: '12000',
                currency: 'EUR',
                paidById: fixture.owner.id,
                splitMode: 'EQUAL',
            }),
        })
        const res = await (postExpense as Handler)(request, { params: Promise.resolve({ slug: fixture.slug }) })
        expect(res.status).toBe(201)

        await waitFor(async () => (await prisma.notificationSend.count()) === 1)
        expect(sendNotification).toHaveBeenCalledTimes(1)
        const payload = JSON.parse(sendNotification.mock.calls[0][1])
        expect(payload).toMatchObject({
            body: 'Someone added Dinner — €120.00',
            template: 'expense_added',
        })
        expect(payload.body).not.toContain('Ana added')
    })
})

describe('feedback beacons', () => {
    const beacon = async (handler: (r: Request) => Promise<Response>, body: unknown) =>
        handler(
            new Request(`${BASE}/api/push/opened`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
        )

    it('counts an open against the ledger row and answers 204', async () => {
        const fixture = await makeRoom()
        const send = await prisma.notificationSend.create({
            data: {
                roomId: fixture.roomId,
                template: 'expense_added',
                dayKey: utcDayKey(),
                dedupeKey: 'k1',
                status: 'sent',
            },
        })

        expect((await beacon(postOpened, { sendId: send.id, template: 'expense_added', action: null })).status).toBe(
            204
        )
        expect((await beacon(postDismissed, { sendId: send.id })).status).toBe(204)

        const after = await prisma.notificationSend.findUniqueOrThrow({ where: { id: send.id } })
        expect(after.openedCount).toBe(1)
        expect(after.dismissedCount).toBe(1)
    })

    it('answers 204 for a body it cannot use, and never throws', async () => {
        expect((await beacon(postOpened, { nonsense: true })).status).toBe(204)
        expect((await beacon(postOpened, { sendId: '00000000-0000-4000-8000-000000000000' })).status).toBe(204)
    })
})

/** Polls a condition for up to a second — for the fire-and-forget sends only. */
async function waitFor(condition: () => Promise<boolean>): Promise<void> {
    for (let i = 0; i < 50; i++) {
        if (await condition()) return
        await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error('condition never became true')
}
