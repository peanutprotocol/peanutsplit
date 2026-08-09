import { describe, expect, it } from 'vitest'
import {
    collectHandoffKeys,
    HANDOFF_DONE_KEY,
    HANDOFF_REPLY_TYPE,
    HANDOFF_VERSION,
    handoffNeedsReload,
    handoffReply,
    handoffRequest,
    importHandoffKeys,
    isHandoffRequest,
    parseHandoffReply,
} from './handoff'

/** A localStorage stand-in over a Map — enough surface for both sides of the bridge. */
const fakeStorage = (entries: Record<string, string> = {}) => {
    const map = new Map(Object.entries(entries))
    return {
        map,
        get length() {
            return map.size
        },
        key: (i: number) => [...map.keys()][i] ?? null,
        getItem: (name: string) => (map.has(name) ? map.get(name)! : null),
        setItem: (name: string, value: string) => void map.set(name, value),
    }
}

describe('collectHandoffKeys', () => {
    it('collects every ps:* key verbatim and nothing else', () => {
        const storage = fakeStorage({
            'ps:recent': '[{"slug":"a"}]',
            'ps:member:trip-abc123': '{"memberId":"m1","name":"Ana","token":"t"}',
            'ps:device': 'uuid-1',
            'ps:settings': '{"animationsEnabled":false}',
            'other-app-key': 'nope',
            'jwt-token': 'nope',
        })
        expect(collectHandoffKeys(storage)).toEqual({
            'ps:recent': '[{"slug":"a"}]',
            'ps:member:trip-abc123': '{"memberId":"m1","name":"Ana","token":"t"}',
            'ps:device': 'uuid-1',
            'ps:settings': '{"animationsEnabled":false}',
        })
    })
})

describe('the envelope', () => {
    it('round-trips: a collected reply parses back to the same keys', () => {
        const keys = { 'ps:device': 'uuid-1', 'ps:recent': '[]' }
        expect(parseHandoffReply(handoffReply(keys))).toEqual(keys)
    })

    it('recognises exactly the versioned request shape', () => {
        expect(isHandoffRequest(handoffRequest())).toBe(true)
        expect(isHandoffRequest({ type: 'ps:handoff:request', v: 2 })).toBe(false)
        expect(isHandoffRequest({ type: 'other' })).toBe(false)
        expect(isHandoffRequest(null)).toBe(false)
        expect(isHandoffRequest('ps:handoff:request')).toBe(false)
    })

    it('rejects malformed replies rather than salvaging them', () => {
        expect(parseHandoffReply(null)).toBeNull()
        expect(parseHandoffReply({})).toBeNull()
        expect(parseHandoffReply({ type: HANDOFF_REPLY_TYPE, v: 99, keys: {} })).toBeNull()
        expect(parseHandoffReply({ type: HANDOFF_REPLY_TYPE, v: HANDOFF_VERSION, keys: [] })).toBeNull()
        // One bad entry poisons the whole reply — a non-ps: key or a non-string value
        // means the sender is not our /handoff page.
        expect(
            parseHandoffReply({ type: HANDOFF_REPLY_TYPE, v: HANDOFF_VERSION, keys: { 'jwt-token': 'x' } })
        ).toBeNull()
        expect(
            parseHandoffReply({ type: HANDOFF_REPLY_TYPE, v: HANDOFF_VERSION, keys: { 'ps:recent': 42 } })
        ).toBeNull()
    })

    it('accepts an empty reply — a fresh legacy device has nothing to hand over', () => {
        expect(parseHandoffReply(handoffReply({}))).toEqual({})
    })
})

describe('importHandoffKeys', () => {
    it('writes absent keys and reports them', () => {
        const storage = fakeStorage()
        const imported = importHandoffKeys({ 'ps:recent': '[]', 'ps:device': 'uuid-1' }, storage)
        expect(imported.sort()).toEqual(['ps:device', 'ps:recent'])
        expect(storage.getItem('ps:device')).toBe('uuid-1')
    })

    it('never clobbers a key the new origin already has', () => {
        const storage = fakeStorage({ 'ps:device': 'uuid-new' })
        const imported = importHandoffKeys({ 'ps:device': 'uuid-old', 'ps:recent': '[]' }, storage)
        expect(imported).toEqual(['ps:recent'])
        expect(storage.getItem('ps:device')).toBe('uuid-new')
    })

    it('never imports the done-guard itself', () => {
        const storage = fakeStorage()
        const imported = importHandoffKeys({ [HANDOFF_DONE_KEY]: '123', 'ps:recent': '[]' }, storage)
        expect(imported).toEqual(['ps:recent'])
        expect(storage.getItem(HANDOFF_DONE_KEY)).toBeNull()
    })

    it('keeps importing past a write that throws', () => {
        const storage = fakeStorage()
        const throwing = {
            getItem: storage.getItem,
            setItem: (name: string, value: string) => {
                if (name === 'ps:ach:trip-abc123') throw new DOMException('quota', 'QuotaExceededError')
                storage.setItem(name, value)
            },
        }
        const imported = importHandoffKeys({ 'ps:ach:trip-abc123': '{}', 'ps:recent': '[]' }, throwing)
        expect(imported).toEqual(['ps:recent'])
        expect(storage.getItem('ps:recent')).toBe('[]')
    })
})

describe('handoffNeedsReload', () => {
    it('asks for a reload only when rooms or identity arrived', () => {
        expect(handoffNeedsReload(['ps:recent'])).toBe(true)
        expect(handoffNeedsReload(['ps:member:trip-abc123'])).toBe(true)
        expect(handoffNeedsReload(['ps:settings', 'ps:device'])).toBe(false)
        expect(handoffNeedsReload([])).toBe(false)
    })
})
