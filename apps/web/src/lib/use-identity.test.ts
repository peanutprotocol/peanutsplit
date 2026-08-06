/**
 * "Not me", and the promise the confirm sheet makes with it.
 *
 * The sheet says this device "stops getting this room's notifications". That is
 * only true because `forgetIdentity` drops the subscription, and it can only do
 * that while the member token is still in localStorage — the token it is about to
 * delete is the same token the drop has to present. So the order is the feature,
 * and these tests are about the order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberStorageKey, readIdentity, writeIdentity } from './identity'
import { forgetIdentity, identityAfterInvalidToken } from './use-identity'

const { dropRoomSubscription } = vi.hoisted(() => ({ dropRoomSubscription: vi.fn() }))

vi.mock('./use-push', () => ({ dropRoomSubscription }))

const SLUG = 'ski-trip'

/** The node environment gives identity.ts nothing, so it gets the one global it
 *  touches — and the real reads and writes, because "was the record still there"
 *  is exactly what is being asserted. */
class MemoryStorage {
    private map = new Map<string, string>()
    getItem(key: string) {
        return this.map.get(key) ?? null
    }
    setItem(key: string, value: string) {
        this.map.set(key, value)
    }
    removeItem(key: string) {
        this.map.delete(key)
    }
}

declare const globalThis: Record<string, unknown> & typeof global

beforeEach(() => {
    globalThis.window = { localStorage: new MemoryStorage() } as unknown as Window & typeof globalThis
    dropRoomSubscription.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
    delete (globalThis as Record<string, unknown>).window
})

/** Lets the swallowed rejection settle, so an unhandled one would surface here
 *  rather than in whichever test file runs next. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('forgetIdentity', () => {
    it('drops this room’s subscription with the token it is about to delete', async () => {
        writeIdentity(SLUG, { memberId: 'm1', name: 'Ana', token: 'tok-1' })
        // Read the record from inside the call: the drop is the last moment the
        // token exists, and clearing first would make the argument unobtainable.
        const storedAtDropTime: (string | null)[] = []
        dropRoomSubscription.mockImplementation(async () => {
            storedAtDropTime.push(window.localStorage.getItem(memberStorageKey(SLUG)))
        })

        forgetIdentity(SLUG, { memberId: 'm1', name: 'Ana', token: 'tok-1' })
        await flush()

        expect(dropRoomSubscription).toHaveBeenCalledWith(SLUG, 'm1', 'tok-1')
        expect(storedAtDropTime).toHaveLength(1)
        expect(storedAtDropTime[0]).toContain('tok-1')
        expect(readIdentity(SLUG)).toBeNull()
    })

    it('still stops being this member when the drop fails', async () => {
        writeIdentity(SLUG, { memberId: 'm1', name: 'Ana', token: 'tok-1' })
        dropRoomSubscription.mockRejectedValue(new Error('offline'))

        // Handing a phone over on a dead network must not be blocked by a request
        // that cannot land. It also must not throw at the caller.
        expect(() => forgetIdentity(SLUG, { memberId: 'm1', name: 'Ana', token: 'tok-1' })).not.toThrow()
        await flush()

        expect(dropRoomSubscription).toHaveBeenCalledTimes(1)
        expect(readIdentity(SLUG)).toBeNull()
    })

    it('asks for nothing on a legacy tokenless identity', async () => {
        writeIdentity(SLUG, { memberId: 'm1', name: 'Ana' })

        forgetIdentity(SLUG, { memberId: 'm1', name: 'Ana' })
        await flush()

        // No token means no proof of membership, so the endpoint would refuse it —
        // and such a device never had a subscription to drop in the first place.
        expect(dropRoomSubscription).not.toHaveBeenCalled()
        expect(readIdentity(SLUG)).toBeNull()
    })
})

describe('invalid token recovery', () => {
    it('clears only the identity whose concrete proof the server refused', async () => {
        const identity = { memberId: 'm1', name: 'Ana', token: 'tok-1' }
        writeIdentity(SLUG, identity)

        expect(identityAfterInvalidToken(SLUG, identity, 'some-other-token')).toBe(identity)
        expect(readIdentity(SLUG)).toEqual(identity)
        expect(identityAfterInvalidToken(SLUG, identity, 'tok-1')).toBeNull()
        await flush()

        expect(readIdentity(SLUG)).toBeNull()
        expect(dropRoomSubscription).toHaveBeenCalledWith(SLUG, 'm1', 'tok-1')
    })
})
