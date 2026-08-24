import { isDoodleName } from '@/components/ui/doodles'
import { CATALOG_BY_CODE } from '@/lib/currency-catalog'
import { firstValue, withParams, type Query, type Utm } from '@/lib/utm'

/**
 * What a link may fill in on `/new`, and how the form reads it back.
 *
 * The composer holds three fields and a link may seed two of them plus the drawing. It may never
 * seed the creator's name: that is the one thing the person tapping has to say, and it is what
 * keeps a link pasted into a group chat from opening a room attributed to whoever wrote the post.
 *
 * Every value is checked against the same catalogue the form itself picks from — an invented
 * ticker has no rate and an unknown drawing is not a drawing — and anything that fails is dropped
 * rather than seeded, which leaves the field on the default it would have had.
 */
export const MAX_PREFILL_NAME = 80

export interface RoomPrefill {
    name?: string
    currency?: string
    emblem?: string
    /** The template this link came from. Reported with `room_created`; never rendered. */
    template?: string
}

const TEMPLATE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

export function readPrefill(query: Query): RoomPrefill {
    const prefill: RoomPrefill = {}

    const name = firstValue(query.name)?.replace(/\s+/g, ' ').trim()
    if (name && name.length <= MAX_PREFILL_NAME) prefill.name = name

    const currency = firstValue(query.currency)?.trim().toUpperCase()
    if (currency && CATALOG_BY_CODE.has(currency)) prefill.currency = currency

    const emblem = firstValue(query.emblem)?.trim()
    if (emblem && isDoodleName(emblem)) prefill.emblem = emblem

    const template = firstValue(query.template)?.trim().toLowerCase()
    if (template && TEMPLATE_SLUG.test(template)) prefill.template = template

    return prefill
}

/** `/new` carrying a prefill, plus the campaign the reader arrived on. */
export const prefillHref = (path: string, prefill: RoomPrefill, utm: Utm = {}): string =>
    withParams(path, { ...prefill, ...utm })
