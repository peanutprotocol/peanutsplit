/**
 * The shape of a template room.
 *
 * A template is one TypeScript config: the room a link materializes, and every string the page
 * around it prints. Routes, the sitemap, the reserved-slug set and the style gate all derive from
 * the registry, so adding a template is adding a file — the contract `src/tools` and `src/content`
 * already have.
 *
 * **A template sets a room up; it never fills one in.** `room` holds the three things a link is
 * allowed to decide (`room-prefill.ts`): what the room is called, what it counts in, and what it
 * looks like. No amounts, no people, no expenses. A room that arrived with money already in it
 * would be numbers nobody in the group had agreed to, and watching each one go in is the product.
 *
 * **Everything identical between templates is not a field.** The CTA label is §9's locale string,
 * the CTA hint and the practical facts are product truth, and the questions heading is a heading —
 * a config that let a template restate any of them is a config that lets one of them drift.
 *
 * Every remaining string a reader sees lives in `meta`, `copy` or `faqs`, so `templates.test.ts`
 * can gate them as a set the way a tool's copy is gated. Copy written inline in a component is
 * copy nothing checks.
 */

import type { DoodleName } from '@/components/ui/doodles'

export interface TemplateFaq {
    question: string
    answer: string
}

/** The room the link opens, before anybody has typed their own name into it. */
export interface TemplateRoom {
    /** Room name, seeded into the composer. Short: it is a heading on every screen in the room. */
    name: string
    /**
     * ISO 4217, and a code the currency catalog knows. Omitted wherever the situation does not
     * pin one — the composer's own guess from the device beats a currency invented here.
     */
    currency?: string
    /** Stated rather than derived from the name, because the unfurl is drawn from it. */
    emblem: DoodleName
}

export interface RoomTemplate {
    /** URL slug: `/t/{slug}`. */
    slug: string
    room: TemplateRoom
    /** ISO date of the last meaningful edit — the sitemap's `lastModified`. */
    updated: string
    meta: {
        title: string
        description: string
    }
    /** The query this page answers, written the way a person types it (stylebook §11.2). */
    headTerm: string
    copy: {
        h1: string
        intro: readonly string[]
        /** What tends to go in this room. A checklist on the page, never rows in the room. */
        lines: {
            title: string
            intro: string
            items: readonly string[]
        }
        /** §4.1: when another tool is the better one. Named, comparative, one paragraph. */
        concession: {
            title: string
            body: string
        }
        /** The CTA's heading. Its label and its hint are shared — see the note above. */
        ctaTitle: string
    }
    faqs: readonly TemplateFaq[]
    /** Where the page sends a reader who does not want the room yet. */
    related?: readonly { href: string; label: string }[]
}
