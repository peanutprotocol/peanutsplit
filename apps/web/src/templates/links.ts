import { prefillHref, type RoomPrefill } from '@/lib/room-prefill'
import { absoluteUrl } from '@/lib/seo'
import { withParams, type Utm } from '@/lib/utm'
import { templatePath } from './registry'
import type { RoomTemplate } from './types'

/**
 * The two links a template has: the one somebody pastes into a community, and the one the page
 * sends a reader to.
 *
 * Kept out of `registry.ts` because these reach the currency catalog and the drawing set through
 * `room-prefill`, and the registry is imported by `static-pages.ts` — which the request proxy
 * pulls in on the edge. A path helper can live next to the configs; a link builder cannot.
 */
export const templatePrefill = (template: RoomTemplate): RoomPrefill => ({
    name: template.room.name,
    currency: template.room.currency,
    emblem: template.room.emblem,
    template: template.slug,
})

/**
 * `/new`, prefilled, carrying the campaign the reader arrived on and nothing invented here — see
 * the note in `utm.ts` on why this hop does not re-source itself.
 */
export const templateCtaHref = (template: RoomTemplate, utm: Utm = {}): string =>
    prefillHref('/new', templatePrefill(template), utm)

/** The absolute link to paste somewhere, tagged with where it is being pasted. */
export const templateShareUrl = (template: RoomTemplate, utm: Utm = {}): string =>
    withParams(absoluteUrl(templatePath(template)), utm)
