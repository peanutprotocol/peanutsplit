import { baliVilla } from './bali-villa'
import { festival } from './festival'
import { flatMonthly } from './flat-monthly'
import { roadTrip } from './road-trip'
import { skiWeek } from './ski-week'
import { villaWeek } from './villa-week'
import type { RoomTemplate } from './types'

/**
 * Every template room on the site.
 *
 * The list is the only thing a new template has to be added to: `/t/[template]` builds its static
 * params from it, `/t` lists it, `sitemap.ts` ranks it and `static-pages.ts` reserves the segment
 * it lives under. None of them holds a second list, for the same reason `src/content` derives its
 * routes from the directory — a list that has to be kept in step is a list that stops being.
 *
 * **English only, and the type has no locale field.** A template is a page and a link, and the
 * link's whole job is to be pasted somewhere; a machine-translated room name is a room name
 * nobody read before it went into a group chat. Translating one means adding words the way a tool
 * does, when there are words to add.
 *
 * **A template never duplicates the app's core loop.** It sets up the room and stops. The reason a
 * template is worth having at all is that `/new` opens on three empty fields, and a link that
 * arrives with two of them already answered is the difference between "here's our website" and
 * "tap this, it's already your room".
 *
 * Ordered by how often the situation comes up, which is the order `/t` lists them in.
 */
export const TEMPLATES: readonly RoomTemplate[] = [flatMonthly, villaWeek, baliVilla, skiWeek, roadTrip, festival]

/** The one path segment every template lives under. Reserved in `static-pages.ts`. */
export const TEMPLATE_ROOT = 't'
export const TEMPLATES_PATH = `/${TEMPLATE_ROOT}`

export const TEMPLATE_SLUGS: readonly string[] = TEMPLATES.map((template) => template.slug)

/**
 * One template, or null. Takes an unvalidated route param so a slug nobody registered — including
 * `undefined` from a route reading the wrong param name — reads as "not a template" and 404s
 * rather than throwing.
 */
export function getTemplate(slug: string | undefined): RoomTemplate | null {
    if (typeof slug !== 'string') return null
    return TEMPLATES.find((template) => template.slug === slug) ?? null
}

export const templatePath = (template: RoomTemplate): string => `${TEMPLATES_PATH}/${template.slug}`
