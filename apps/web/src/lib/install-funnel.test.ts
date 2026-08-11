import { describe, expect, it } from 'vitest'
import {
    clearMatureRoomReturnEvidence,
    COMPETING_GUIDANCE_DEFER_MS,
    deferredRoomInstallWaitMs,
    deferRoomInstallAfterCompetingGuidance,
    eligibleRoomInstallTrigger,
    markRoomCreatedHere,
    MATURE_RETURN_MS,
    INSTALL_QUALIFICATION_TTL_MS,
    noteMatureContribution,
    noteMatureRoomActivity,
    noteMatureRoomAway,
    noteMatureRoomVisit,
    noteRoomShareCompleted,
    promotedRoomInstallTrigger,
    readRoomInstallFunnel,
    ROOM_INSTALL_KEY_PREFIX,
} from './install-funnel'

class MemoryStorage {
    values = new Map<string, string>()
    getItem(key: string) {
        return this.values.get(key) ?? null
    }
    setItem(key: string, value: string) {
        this.values.set(key, value)
    }
}

const SLUG = 'trip-abcdefghijklmnopqrstuv'

describe('the semantic install funnel', () => {
    it('requires both creator milestones, in either order', () => {
        const first = new MemoryStorage()
        markRoomCreatedHere(SLUG, first)
        noteRoomShareCompleted(SLUG, false, 100, first)
        expect(eligibleRoomInstallTrigger(SLUG, 101, first)).toBeNull()
        noteMatureRoomVisit(SLUG, 200, first)
        expect(eligibleRoomInstallTrigger(SLUG, 201, first)).toBe('balance_and_share')

        const second = new MemoryStorage()
        markRoomCreatedHere(SLUG, second)
        noteMatureRoomVisit(SLUG, 100, second)
        expect(eligibleRoomInstallTrigger(SLUG, 101, second)).toBeNull()
        noteRoomShareCompleted(SLUG, true, 200, second)
        expect(eligibleRoomInstallTrigger(SLUG, 201, second)).toBe('balance_and_share')
    })

    it('does not turn the first mature view into a return, then qualifies a genuine absence', () => {
        const first = new MemoryStorage()
        noteMatureRoomVisit(SLUG, 100, first)
        expect(eligibleRoomInstallTrigger(SLUG, 101, first)).toBeNull()

        const short = new MemoryStorage()
        noteMatureRoomVisit(SLUG, 100, short)
        noteMatureRoomAway(SLUG, 200, short)
        noteMatureRoomVisit(SLUG, 200 + MATURE_RETURN_MS - 1, short)
        expect(eligibleRoomInstallTrigger(SLUG, 200 + MATURE_RETURN_MS, short)).toBeNull()

        const returned = new MemoryStorage()
        noteMatureRoomVisit(SLUG, 100, returned)
        noteMatureRoomAway(SLUG, 200, returned)
        // Duplicate lifecycle events retain the first boundary instead of moving the clock.
        noteMatureRoomAway(SLUG, 300, returned)
        noteMatureRoomVisit(SLUG, 200 + MATURE_RETURN_MS, returned)
        expect(eligibleRoomInstallTrigger(SLUG, 200 + MATURE_RETURN_MS, returned)).toBe('mature_return')
    })

    it('keeps a continuously foregrounded session recent across a late reload', () => {
        const store = new MemoryStorage()
        noteMatureRoomVisit(SLUG, 100, store)

        // Thirty-one minutes elapsed, but the visible-session heartbeat is current.
        const heartbeatAt = 100 + MATURE_RETURN_MS + 60_000
        noteMatureRoomActivity(SLUG, heartbeatAt, store)
        expect(readRoomInstallFunnel(SLUG, store).lastMatureActiveAt).toBe(heartbeatAt)
        noteMatureRoomAway(SLUG, heartbeatAt + 1, store)
        expect(readRoomInstallFunnel(SLUG, store).matureAwaySince).toBe(heartbeatAt + 1)
        noteMatureRoomVisit(SLUG, heartbeatAt + 2, store)

        expect(eligibleRoomInstallTrigger(SLUG, heartbeatAt + 3, store)).toBeNull()
        expect(readRoomInstallFunnel(SLUG, store).matureAwaySince).toBeUndefined()
    })

    it('uses the last heartbeat when a killed process could not emit pagehide', () => {
        const store = new MemoryStorage()
        noteMatureRoomVisit(SLUG, 100, store)

        noteMatureRoomVisit(SLUG, 100 + MATURE_RETURN_MS, store)
        expect(eligibleRoomInstallTrigger(SLUG, 100 + MATURE_RETURN_MS, store)).toBe('mature_return')
    })

    it('clears return evidence while a room is settled or otherwise ineligible', () => {
        const store = new MemoryStorage()
        noteMatureRoomVisit(SLUG, 100, store)
        noteMatureRoomAway(SLUG, 200, store)
        clearMatureRoomReturnEvidence(SLUG, store)

        noteMatureRoomVisit(SLUG, 200 + MATURE_RETURN_MS, store)
        expect(eligibleRoomInstallTrigger(SLUG, 200 + MATURE_RETURN_MS, store)).toBeNull()
    })

    it('accepts only an opened-room contribution already acknowledged by a mature server room', () => {
        for (const options of [
            { roomWasMature: false, queuedLocally: false, createdFirstSharedBalance: false },
            { roomWasMature: true, queuedLocally: true, createdFirstSharedBalance: false },
            // A lost response can let the cache observe the latch before an
            // idempotent retry returns the activating result again.
            { roomWasMature: true, queuedLocally: false, createdFirstSharedBalance: true },
        ]) {
            const store = new MemoryStorage()
            noteMatureContribution(SLUG, options, 100, store)
            expect(eligibleRoomInstallTrigger(SLUG, 101, store)).toBeNull()
        }

        const opened = new MemoryStorage()
        noteMatureContribution(
            SLUG,
            { roomWasMature: true, queuedLocally: false, createdFirstSharedBalance: false },
            100,
            opened
        )
        expect(eligibleRoomInstallTrigger(SLUG, 101, opened)).toBe('mature_contribution')

        const creator = new MemoryStorage()
        markRoomCreatedHere(SLUG, creator)
        noteMatureContribution(
            SLUG,
            { roomWasMature: true, queuedLocally: false, createdFirstSharedBalance: false },
            100,
            creator
        )
        expect(eligibleRoomInstallTrigger(SLUG, 101, creator)).toBeNull()
    })

    it('defers an earned ask after post-aha Share is skipped, while a later success clears the deferral', () => {
        const store = new MemoryStorage()
        noteRoomShareCompleted(SLUG, false, 100, store)
        noteMatureRoomVisit(SLUG, 200, store)
        deferRoomInstallAfterCompetingGuidance(SLUG, 300, store)

        expect(eligibleRoomInstallTrigger(SLUG, 300 + COMPETING_GUIDANCE_DEFER_MS - 1, store)).toBeNull()
        expect(eligibleRoomInstallTrigger(SLUG, 300 + COMPETING_GUIDANCE_DEFER_MS, store)).toBe('balance_and_share')

        deferRoomInstallAfterCompetingGuidance(SLUG, 400, store)
        noteRoomShareCompleted(SLUG, true, 401, store)
        expect(eligibleRoomInstallTrigger(SLUG, 402, store)).toBe('balance_and_share')
    })

    it('uses the quiet slot without persisting it when no semantic trigger was earned', () => {
        const opened = new MemoryStorage()
        expect(eligibleRoomInstallTrigger(SLUG, 100, opened)).toBeNull()
        expect(promotedRoomInstallTrigger(SLUG, 100, opened)).toBe('quiet_slot')
        expect(readRoomInstallFunnel(SLUG, opened).qualifiedTrigger).toBeUndefined()

        const creator = new MemoryStorage()
        markRoomCreatedHere(SLUG, creator)
        expect(promotedRoomInstallTrigger(SLUG, 100, creator)).toBe('quiet_slot')
        expect(readRoomInstallFunnel(SLUG, creator).qualifiedTrigger).toBeUndefined()
    })

    it('keeps an earned reason as promotion attribution instead of replacing it with the quiet slot', () => {
        const store = new MemoryStorage()
        noteMatureContribution(
            SLUG,
            { roomWasMature: true, queuedLocally: false, createdFirstSharedBalance: false },
            100,
            store
        )

        expect(promotedRoomInstallTrigger(SLUG, 101, store)).toBe('mature_contribution')
    })

    it('lets any dismissed competing guidance defer both earned and quiet-slot promotion', () => {
        const quiet = new MemoryStorage()
        deferRoomInstallAfterCompetingGuidance(SLUG, 100, quiet)
        expect(promotedRoomInstallTrigger(SLUG, 100 + COMPETING_GUIDANCE_DEFER_MS - 1, quiet)).toBeNull()
        expect(promotedRoomInstallTrigger(SLUG, 100 + COMPETING_GUIDANCE_DEFER_MS, quiet)).toBe('quiet_slot')

        const earned = new MemoryStorage()
        noteMatureContribution(
            SLUG,
            { roomWasMature: true, queuedLocally: false, createdFirstSharedBalance: false },
            100,
            earned
        )
        deferRoomInstallAfterCompetingGuidance(SLUG, 200, earned)
        expect(promotedRoomInstallTrigger(SLUG, 200 + COMPETING_GUIDANCE_DEFER_MS - 1, earned)).toBeNull()
        expect(promotedRoomInstallTrigger(SLUG, 200 + COMPETING_GUIDANCE_DEFER_MS, earned)).toBe('mature_contribution')
    })

    it('exposes only the remaining defer duration needed for a live refresh', () => {
        const store = new MemoryStorage()
        expect(deferredRoomInstallWaitMs(SLUG, 100, store)).toBeNull()

        deferRoomInstallAfterCompetingGuidance(SLUG, 100, store)
        expect(deferredRoomInstallWaitMs(SLUG, 101, store)).toBe(COMPETING_GUIDANCE_DEFER_MS - 1)
        expect(deferredRoomInstallWaitMs(SLUG, 100 + COMPETING_GUIDANCE_DEFER_MS, store)).toBeNull()
    })

    it('treats malformed storage as an opened-room first visit', () => {
        const store = new MemoryStorage()
        store.setItem(`${ROOM_INSTALL_KEY_PREFIX}${SLUG}`, '{broken')
        expect(readRoomInstallFunnel(SLUG, store)).toEqual({ version: 1, origin: 'opened_here' })
        expect(eligibleRoomInstallTrigger(SLUG, 100, store)).toBeNull()
    })

    it('fails closed for future qualification times and does not pair a months-old or future share', () => {
        const futureQualification = new MemoryStorage()
        futureQualification.setItem(
            `${ROOM_INSTALL_KEY_PREFIX}${SLUG}`,
            JSON.stringify({
                version: 1,
                origin: 'opened_here',
                qualifiedTrigger: 'mature_return',
                qualifiedAt: 10_000,
            })
        )
        expect(eligibleRoomInstallTrigger(SLUG, 100, futureQualification)).toBeNull()

        const futureAway = new MemoryStorage()
        futureAway.setItem(
            `${ROOM_INSTALL_KEY_PREFIX}${SLUG}`,
            JSON.stringify({
                version: 1,
                origin: 'opened_here',
                lastMatureActiveAt: 1,
                matureAwaySince: 10_000,
            })
        )
        noteMatureRoomVisit(SLUG, 100, futureAway)
        expect(eligibleRoomInstallTrigger(SLUG, 101, futureAway)).toBeNull()

        const maturityAt = 100 + INSTALL_QUALIFICATION_TTL_MS + 1
        for (const shareCompletedAt of [100, maturityAt + 1]) {
            const store = new MemoryStorage()
            store.setItem(
                `${ROOM_INSTALL_KEY_PREFIX}${SLUG}`,
                JSON.stringify({ version: 1, origin: 'created_here', shareCompletedAt })
            )
            noteMatureRoomVisit(SLUG, maturityAt, store)
            expect(eligibleRoomInstallTrigger(SLUG, maturityAt + 1, store)).toBeNull()
        }
    })
})
