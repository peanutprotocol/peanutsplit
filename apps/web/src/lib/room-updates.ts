/** Device-local setup progress. This is never notification permission or proof of a subscription. */
export interface RoomUpdatesState {
    requestedAt?: number
    subscribedAt?: number
    muted?: boolean
}

export const ROOM_UPDATES_CHANGE_EVENT = 'ps:room-updates-change'
export const ROOM_UPDATES_REQUEST_TTL_MS = 24 * 60 * 60 * 1000
export const roomUpdatesStorageKey = (slug: string): string => `ps:room-updates:${slug}`

const browserStorage = (): Storage | null => {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage
    } catch {
        return null
    }
}

const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

export function readRoomUpdates(slug: string): RoomUpdatesState {
    try {
        const raw = browserStorage()?.getItem(roomUpdatesStorageKey(slug))
        if (!raw) return {}
        const value: unknown = JSON.parse(raw)
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
        const { requestedAt, subscribedAt, muted } = value as Record<string, unknown>
        const state: RoomUpdatesState = {}
        const now = Date.now()
        if (validTime(requestedAt) && requestedAt <= now && now - requestedAt < ROOM_UPDATES_REQUEST_TTL_MS)
            state.requestedAt = requestedAt
        if (validTime(subscribedAt)) state.subscribedAt = subscribedAt
        if (muted === true) state.muted = true
        return state
    } catch {
        return {}
    }
}

const writeRoomUpdates = (slug: string, state: RoomUpdatesState): void => {
    const storage = browserStorage()
    if (!storage) return
    try {
        if (Object.keys(state).length === 0) storage.removeItem(roomUpdatesStorageKey(slug))
        else storage.setItem(roomUpdatesStorageKey(slug), JSON.stringify(state))
        window.dispatchEvent?.(new Event(ROOM_UPDATES_CHANGE_EVENT))
    } catch {
        // Setup can still proceed when the browser cannot remember progress.
    }
}

export function requestRoomUpdates(slug: string): void {
    const state = readRoomUpdates(slug)
    delete state.muted
    writeRoomUpdates(slug, { ...state, requestedAt: Date.now() })
}

/** Call only after the server has saved this room's subscription. */
export function completeRoomUpdates(slug: string): void {
    writeRoomUpdates(slug, { subscribedAt: Date.now() })
}

export function muteRoomUpdates(slug: string): void {
    const state = readRoomUpdates(slug)
    delete state.requestedAt
    writeRoomUpdates(slug, { ...state, muted: true })
}

export function clearRoomUpdatesRequest(slug: string): void {
    const state = readRoomUpdates(slug)
    delete state.requestedAt
    writeRoomUpdates(slug, state)
}

export function clearRoomUpdates(slug: string): void {
    writeRoomUpdates(slug, {})
}
