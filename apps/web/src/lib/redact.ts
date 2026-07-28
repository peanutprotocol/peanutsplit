/**
 * Slug redaction for anything that leaves the device.
 *
 * A room slug IS the room's access control — whoever has it can read and write
 * the room. It also sits in the URL of every page and every API call, so any
 * telemetry that ships a URL verbatim (error reports, breadcrumbs) is shipping a
 * credential to a third party. Every such string goes through here first.
 */

/** `/r/ski-trip-x7k2m9` and `/api/rooms/ski-trip-x7k2m9/expenses` — the two
 *  shapes a slug ever appears in. Query and hash are left alone; nothing puts a
 *  slug there. */
const SLUG_PATHS = [/(\/r)\/[^/?#]+/g, /(\/api\/rooms)\/[^/?#]+/g]

export function redactRoomSlugs(value: string): string {
    let out = value
    for (const pattern of SLUG_PATHS) out = out.replace(pattern, '$1/[slug]')
    return out
}

/** In-place variant for the loosely-typed bags Sentry hands us (`Record<string,
 *  unknown>`), where a missing or non-string field is normal. */
export function redactField(bag: Record<string, unknown> | undefined, key: string): void {
    if (!bag) return
    const value = bag[key]
    if (typeof value === 'string') bag[key] = redactRoomSlugs(value)
}
