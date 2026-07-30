/**
 * Slug redaction for anything that leaves the device.
 *
 * A room slug IS the room's access control — whoever has it can read and write
 * the room. It also sits in the URL of every page and every API call, so any
 * telemetry that ships a URL verbatim (error reports, breadcrumbs) is shipping a
 * credential to a third party. Every such string goes through here first.
 */

/** `/r/ski-trip-x7k2m9` and `/api/rooms/ski-trip-x7k2m9/expenses` — the two
 *  shapes a slug ever appears in. */
const SLUG_PATHS = [/(\/r)\/[^/?#]+/g, /(\/api\/rooms)\/[^/?#]+/g]

/**
 * The card query string, dropped whole.
 *
 * The slug patterns above stop at `?` because nothing used to put anything worth hiding there.
 * The alter-ego card does: `/r/<slug>/card/alterego?a=theCloser&p=disco-octopus` names the award
 * and the persona of the person holding the phone. An award IS a description of a person, which is
 * the reason `analytics.ts` refuses to send one — shipping it to Sentry instead is the same leak
 * through a different pipe.
 */
const CARD_QUERY = /(\/card\/[a-z]+)\?[^#\s"']*/g

export function redactRoomSlugs(value: string): string {
    let out = value
    for (const pattern of SLUG_PATHS) out = out.replace(pattern, '$1/[slug]')
    return out.replace(CARD_QUERY, '$1')
}

/** In-place variant for the loosely-typed bags Sentry hands us (`Record<string,
 *  unknown>`), where a missing or non-string field is normal. */
export function redactField(bag: Record<string, unknown> | undefined, key: string): void {
    if (!bag) return
    const value = bag[key]
    if (typeof value === 'string') bag[key] = redactRoomSlugs(value)
}
