import { describe, expect, it } from 'vitest'
import {
    AUTO_INSTALL_SHOWN_COOLDOWN_MS,
    AUTO_INSTALL_SHOWN_AT_KEY,
    clearMatureRoomReturnEvidence,
    eligibleRoomInstallTrigger,
    markRoomCreatedHere,
    MATURE_RETURN_MS,
    INSTALL_QUALIFICATION_TTL_MS,
    noteAutoInstallShown,
    noteMatureContribution,
    noteMatureRoomActivity,
    noteMatureRoomAway,
    noteMatureRoomVisit,
    noteRoomShareCompleted,
    POST_AHA_SKIP_DEFER_MS,
    deferRoomInstallAfterSkippedShare,
    readRoomInstallFunnel,
    ROOM_INSTALL_KEY_PREFIX,
    wasAutoInstallShownRecently,
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
        deferRoomInstallAfterSkippedShare(SLUG, 300, store)

        expect(eligibleRoomInstallTrigger(SLUG, 300 + POST_AHA_SKIP_DEFER_MS - 1, store)).toBeNull()
        expect(eligibleRoomInstallTrigger(SLUG, 300 + POST_AHA_SKIP_DEFER_MS, store)).toBe('balance_and_share')

        deferRoomInstallAfterSkippedShare(SLUG, 400, store)
        noteRoomShareCompleted(SLUG, true, 401, store)
        expect(eligibleRoomInstallTrigger(SLUG, 402, store)).toBe('balance_and_share')
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

    it('throttles automatic cards globally for 24 hours without affecting room qualification', () => {
        const store = new MemoryStorage()
        noteAutoInstallShown(1_000, store)
        expect(store.getItem(AUTO_INSTALL_SHOWN_AT_KEY)).toBe('1000')
        expect(wasAutoInstallShownRecently(1_000 + AUTO_INSTALL_SHOWN_COOLDOWN_MS - 1, store)).toBe(true)
        expect(wasAutoInstallShownRecently(1_000 + AUTO_INSTALL_SHOWN_COOLDOWN_MS, store)).toBe(false)
    })
})
