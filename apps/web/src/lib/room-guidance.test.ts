import { describe, expect, it } from 'vitest'
import {
    resolveRoomGuidance,
    ROOM_GUIDANCE_PRIORITY,
    type RoomGuidanceOwner,
    type RoomGuidanceSignals,
} from './room-guidance'

const quiet: RoomGuidanceSignals = {
    identity: false,
    recovery: false,
    postAhaShare: false,
    activeFlow: false,
    roomActivation: false,
    latecomerReview: false,
    allSettledMoment: false,
    achievement: false,
}

const signalFor = {
    identity: 'identity',
    recovery: 'recovery',
    post_aha_share: 'postAhaShare',
    active_flow: 'activeFlow',
    room_activation: 'roomActivation',
    latecomer_review: 'latecomerReview',
    all_settled_moment: 'allSettledMoment',
    achievement: 'achievement',
} as const satisfies Record<Exclude<RoomGuidanceOwner, 'install'>, keyof RoomGuidanceSignals>

describe('room guidance priority', () => {
    it('promotes install when no temporary journey owns the slot', () => {
        expect(resolveRoomGuidance(quiet)).toBe('install')
    })

    it.each(ROOM_GUIDANCE_PRIORITY.filter((owner) => owner !== 'install'))(
        'lets %s own the slot when it is the only competing moment',
        (owner) => {
            expect(resolveRoomGuidance({ ...quiet, [signalFor[owner]]: true })).toBe(owner)
        }
    )

    it('resolves overlapping moments in the documented order', () => {
        const allActive = Object.fromEntries(
            Object.keys(quiet).map((key) => [key, true])
        ) as unknown as RoomGuidanceSignals
        expect(resolveRoomGuidance(allActive)).toBe('identity')

        expect(resolveRoomGuidance({ ...allActive, identity: false, recovery: false })).toBe('post_aha_share')
        expect(
            resolveRoomGuidance({
                ...allActive,
                identity: false,
                recovery: false,
                postAhaShare: false,
                activeFlow: false,
            })
        ).toBe('room_activation')
        expect(
            resolveRoomGuidance({
                ...quiet,
                latecomerReview: true,
                allSettledMoment: true,
                achievement: true,
            })
        ).toBe('latecomer_review')
    })

    it('does not treat the durable settled state as a permanent competing CTA', () => {
        // Callers set `allSettledMoment` only for the just-reached celebration. A room loaded on a
        // later visit is quiet even though its durable server state is still settled.
        expect(resolveRoomGuidance({ ...quiet, allSettledMoment: true })).toBe('all_settled_moment')
        expect(resolveRoomGuidance({ ...quiet, allSettledMoment: false })).toBe('install')
    })
})
