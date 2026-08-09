/**
 * The localStorage handoff between the legacy origin and the canonical one.
 *
 * Split is accountless: everything a device knows — member tokens, recent rooms, the
 * device id, settings, achievements, offline drafts — lives in `ps:*` localStorage keys,
 * and localStorage does not cross origins. Without a bridge, every device arriving on
 * `split.peanut.me` would look brand new: rooms gone from the landing page, identity
 * re-minted server-side, settings reset.
 *
 * The bridge: the new origin iframes the OLD origin's `/handoff` page, asks over
 * postMessage, and the old origin replies with every `ps:*` key verbatim. Both sides
 * check `event.origin` against an exact literal — no CSP exists in this app, so this
 * check IS the origin gate. This module owns the pure parts (envelope, collection,
 * import) so they can be tested against a plain object; the DOM choreography lives in
 * `components/handoff/`.
 *
 * Import is write-if-absent, per key: state the new origin has already accumulated is
 * never clobbered by an older copy from the legacy origin.
 */

export const HANDOFF_VERSION = 1
export const HANDOFF_REQUEST_TYPE = 'ps:handoff:request'
export const HANDOFF_REPLY_TYPE = 'ps:handoff:reply'

/** Set once the import ran (or timed out); the iframe is never created again. */
export const HANDOFF_DONE_KEY = 'ps:handoff-done'

const PS_PREFIX = 'ps:'

export interface HandoffRequest {
    type: typeof HANDOFF_REQUEST_TYPE
    v: typeof HANDOFF_VERSION
}

export interface HandoffReply {
    type: typeof HANDOFF_REPLY_TYPE
    v: typeof HANDOFF_VERSION
    keys: Record<string, string>
}

export const handoffRequest = (): HandoffRequest => ({ type: HANDOFF_REQUEST_TYPE, v: HANDOFF_VERSION })

export const isHandoffRequest = (data: unknown): data is HandoffRequest => {
    if (typeof data !== 'object' || data === null) return false
    const { type, v } = data as Record<string, unknown>
    return type === HANDOFF_REQUEST_TYPE && v === HANDOFF_VERSION
}

/**
 * Every `ps:*` key on this device, values verbatim — no parsing, no filtering beyond
 * the prefix. The receiving side decides what to do with each key; this side's only
 * job is to not editorialise.
 */
export function collectHandoffKeys(storage: Pick<Storage, 'length' | 'key' | 'getItem'>): Record<string, string> {
    const keys: Record<string, string> = {}
    for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i)
        if (!name || !name.startsWith(PS_PREFIX)) continue
        const value = storage.getItem(name)
        if (value !== null) keys[name] = value
    }
    return keys
}

export const handoffReply = (keys: Record<string, string>): HandoffReply => ({
    type: HANDOFF_REPLY_TYPE,
    v: HANDOFF_VERSION,
    keys,
})

/**
 * The reply's `ps:*` keys, or `null` when the message is not a well-formed v1 reply.
 * A postMessage payload is attacker-shaped by definition — even after the origin
 * check, nothing here is trusted: every entry must be a string-valued `ps:*` key.
 */
export function parseHandoffReply(data: unknown): Record<string, string> | null {
    if (typeof data !== 'object' || data === null) return null
    const { type, v, keys } = data as Record<string, unknown>
    if (type !== HANDOFF_REPLY_TYPE || v !== HANDOFF_VERSION) return null
    if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) return null
    const out: Record<string, string> = {}
    for (const [name, value] of Object.entries(keys)) {
        if (!name.startsWith(PS_PREFIX) || typeof value !== 'string') return null
        out[name] = value
    }
    return out
}

/**
 * Write-if-absent import. Returns the names actually written, so the caller can decide
 * whether anything user-visible (rooms, identity) arrived and warrants a refresh.
 * The guard key itself is never imported — whether THIS origin already ran the handoff
 * is this origin's own fact.
 */
export function importHandoffKeys(
    keys: Record<string, string>,
    storage: Pick<Storage, 'getItem' | 'setItem'>
): string[] {
    const imported: string[] = []
    for (const [name, value] of Object.entries(keys)) {
        if (name === HANDOFF_DONE_KEY) continue
        if (storage.getItem(name) !== null) continue
        try {
            storage.setItem(name, value)
            imported.push(name)
        } catch {
            // Quota or privacy mode: keep going — a partial import beats none.
        }
    }
    return imported
}

/** Did the import bring anything the landing page renders from — a room list or a member identity? */
export const handoffNeedsReload = (imported: string[]): boolean =>
    imported.some((name) => name === 'ps:recent' || name.startsWith('ps:member:'))
