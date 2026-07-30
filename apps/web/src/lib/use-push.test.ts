/**
 * The three calls that must stay in lock-step with the server, tested against a
 * fake browser rather than a rendered hook — the rules worth pinning are about
 * when the device's push channel may be revoked, and what the row is allowed to
 * claim about it. None of them are React.
 *
 * The fake models the one fact that makes those rules necessary: a browser has
 * a SINGLE PushSubscription per origin, which every room shares.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addRoomSubscription, dropRoomSubscription, roomSubscribed } from './use-push'

const { subscribe, unsubscribe, status } = vi.hoisted(() => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    status: vi.fn(),
}))

vi.mock('./api', () => ({ api: { push: { subscribe, unsubscribe, status } } }))

const { readIdentity } = vi.hoisted(() => ({ readIdentity: vi.fn() }))

vi.mock('./identity', () => ({ readIdentity }))

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/this-device'

class FakeSubscription {
    revoked = false
    constructor(readonly endpoint: string) {}
    toJSON() {
        return { endpoint: this.endpoint, keys: { p256dh: 'p256dhKey', auth: 'authKey' } }
    }
    async unsubscribe() {
        this.revoked = true
        browser.subscription = null
        return true
    }
}

/** For the calls that take a subscription rather than finding one themselves. */
const fakeSubscription = () => new FakeSubscription(ENDPOINT) as unknown as PushSubscription

/** The origin's one channel. */
const browser: { subscription: FakeSubscription | null } = { subscription: null }

const registration = {
    pushManager: {
        getSubscription: async () => browser.subscription,
        // Returns the channel the origin already has — a second subscribe with
        // the same key never mints a second endpoint. This is the behaviour the
        // rollback rule exists for.
        subscribe: async () => (browser.subscription ??= new FakeSubscription(ENDPOINT)),
    },
}

beforeEach(() => {
    browser.subscription = null
    subscribe.mockReset().mockResolvedValue({ subscribed: true })
    unsubscribe.mockReset().mockResolvedValue({ subscribed: false, endpointStillUsed: false })
    status.mockReset().mockResolvedValue({ subscribed: true })
    readIdentity.mockReset().mockReturnValue({ memberId: 'm1', name: 'Ana', token: 't1' })
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'aGkh'
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: async () => 'granted' })
    vi.stubGlobal('navigator', {
        userAgent: 'test-agent',
        serviceWorker: { getRegistration: async () => registration, ready: Promise.resolve(registration) },
    })
})

afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
})

describe('addRoomSubscription', () => {
    it('registers this device against the room and keeps the channel', async () => {
        expect(await addRoomSubscription('ski-trip', 'm1', 't1')).toEqual({ status: 'subscribed' })
        expect(subscribe).toHaveBeenCalledWith('ski-trip', expect.objectContaining({ endpoint: ENDPOINT }))
        expect(browser.subscription).not.toBeNull()
    })

    it('reports a refusal as an answer rather than a failure', async () => {
        vi.stubGlobal('Notification', { permission: 'default', requestPermission: async () => 'denied' })
        expect(await addRoomSubscription('ski-trip', 'm1', 't1')).toEqual({ status: 'denied', permission: 'denied' })
        expect(subscribe).not.toHaveBeenCalled()
    })

    it('takes back a channel it created when the server refuses the row', async () => {
        subscribe.mockRejectedValue(new Error('MEMBER_TOKEN_INVALID'))

        await expect(addRoomSubscription('ski-trip', 'm1', 't1')).rejects.toThrow('MEMBER_TOKEN_INVALID')
        // Nothing else can be delivering on it: this call is what made it.
        expect(browser.subscription).toBeNull()
    })

    /** The bug this pins: one device, notifications already on for the ski trip,
     *  a failed attempt in the flat share. The endpoint is shared, so revoking
     *  it here would silence the ski trip to tidy up a failure somewhere else. */
    it('leaves a channel another room is already using alone when the server refuses', async () => {
        const live = new FakeSubscription(ENDPOINT)
        browser.subscription = live
        subscribe.mockRejectedValue(new Error('PUSH_SUBSCRIPTION_LIMIT'))

        await expect(addRoomSubscription('flat-share', 'm2', 't2')).rejects.toThrow('PUSH_SUBSCRIPTION_LIMIT')
        expect(live.revoked).toBe(false)
        expect(browser.subscription).toBe(live)
    })
})

describe('dropRoomSubscription', () => {
    it('keeps the channel while another room still needs it', async () => {
        const live = new FakeSubscription(ENDPOINT)
        browser.subscription = live
        unsubscribe.mockResolvedValue({ subscribed: false, endpointStillUsed: true })

        await dropRoomSubscription('ski-trip', 'm1', 't1')
        expect(unsubscribe).toHaveBeenCalledWith('ski-trip', expect.objectContaining({ endpoint: ENDPOINT }))
        expect(live.revoked).toBe(false)
    })

    it('gives the channel back once no room wants it', async () => {
        const live = new FakeSubscription(ENDPOINT)
        browser.subscription = live

        await dropRoomSubscription('ski-trip', 'm1', 't1')
        expect(live.revoked).toBe(true)
    })

    it('leaves the channel alone when the server call fails', async () => {
        const live = new FakeSubscription(ENDPOINT)
        browser.subscription = live
        unsubscribe.mockRejectedValue(new Error('offline'))

        await expect(dropRoomSubscription('ski-trip', 'm1', 't1')).rejects.toThrow('offline')
        expect(live.revoked).toBe(false)
    })
})

describe('roomSubscribed', () => {
    it('passes the server’s answer through, either way', async () => {
        const live = fakeSubscription()

        expect(await roomSubscribed('ski-trip', live)).toBe(true)
        expect(status).toHaveBeenCalledWith('ski-trip', {
            endpoint: ENDPOINT,
            memberId: 'm1',
            memberToken: 't1',
        })

        status.mockResolvedValue({ subscribed: false })
        expect(await roomSubscribed('ski-trip', live)).toBe(false)
    })

    /**
     * The dishonesty this replaces: the check failed, so the row said "off" while
     * the server row was still there and the phone was still buzzing. "Off" is
     * safe for the server and a lie to the person holding the phone, and the
     * surface renders `unknown` as "couldn't check" instead of a switch.
     */
    it('says it could not check rather than "off" when the request fails', async () => {
        status.mockRejectedValue(new Error('offline'))
        expect(await roomSubscribed('ski-trip', fakeSubscription())).toBe('unknown')
    })

    it('answers off without asking when the identity has no token', async () => {
        readIdentity.mockReturnValue({ memberId: 'm1', name: 'Ana' })

        // Nothing to check: that device cannot prove membership, and the surface
        // sends it to pick a name again before it can turn anything on.
        expect(await roomSubscribed('ski-trip', fakeSubscription())).toBe(false)
        expect(status).not.toHaveBeenCalled()
    })
})
