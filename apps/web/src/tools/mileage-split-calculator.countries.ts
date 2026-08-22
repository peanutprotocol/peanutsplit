import { MILEAGE_RATES, MILEAGE_RATES_RETRIEVED, type MileageRate } from './mileage-rates'
import { mileageSplitCalculator, rateText } from './mileage-split-calculator'
import { formatDate } from '@/lib/seo'
import type { Tool } from './types'

/**
 * One page per official rate, at `/mileage-split-calculator/uk`.
 *
 * The query is "uk mileage split calculator" rather than "mileage split calculator", and the
 * honest answer to it is the same calculator opened on that country's rate. So a country page IS
 * the tool: same fields, same arithmetic, same picker — the reader can still switch country — and
 * only the words that name the country and its rate are the row's.
 *
 * **The data decides which pages exist.** A row with `rate: null` gets none. France, Ireland and
 * Poland publish a structure no single figure falls out of, and Brazil publishes no per-distance
 * rate at all, so those four pages would be titled for a number that does not exist.
 *
 * Words only, keyed off one row — the same division `ToolWords` draws for a translation. Nothing
 * here touches `compute`, `fields` or `data`, so a country page cannot answer differently from the
 * calculator it is a view of.
 */

export interface MileageCountryPage {
    row: MileageRate
    /** The calculator this hangs under, which is the first segment of the path. */
    toolSlug: string
    /** The second segment. */
    slug: string
    /** Root-relative path, which is also what the page canonicalises to. */
    path: string
    /** The rate as a sentence says it: on the page, and in the link that reaches the page. */
    rateWords: string
    /** The mileage tool, worded for this country. */
    tool: Tool
    /** The picker option the page opens on, keyed by choice name. */
    start: Record<string, string>
}

function countryPage(row: MileageRate, rate: number): MileageCountryPage {
    const figure = rateText(rate)
    const rateWords = `${figure} ${row.currency} a ${row.unit === 'mile' ? 'mile' : 'kilometre'}`
    const h1 = `${row.name} mileage split calculator`
    return {
        row,
        toolSlug: mileageSplitCalculator.slug,
        slug: row.slug,
        path: `/${mileageSplitCalculator.slug}/${row.slug}`,
        rateWords,
        start: { country: row.code },
        tool: {
            ...mileageSplitCalculator,
            meta: {
                // The currency is not in the title: it does not fit under the 60-character cap for
                // every country, and a format that holds for some rows and not others is a page
                // family that looks broken in a result list. The description names it.
                title: `${h1}, ${figure}/${row.unit === 'mile' ? 'mi' : 'km'}`,
                description: `The official ${row.name} rate is ${rateWords}. Cost the drive at it, split it between the passengers, and type over it if you know the car better.`,
            },
            copy: {
                ...mileageSplitCalculator.copy,
                h1,
                // The heading above names the country and the picker below prints the row's note, so
                // neither is repeated here. The authority stays out too — half the source labels are
                // bodies and half are statutes, and no one article fits both. The FAQ cites it.
                intro: [
                    `Say how far the car went and how many people were in it. The drive is costed at the official rate, ${rateWords}, and underneath is what each passenger owes whoever drove.`,
                    'Type over it if you know the car better than the state does, or build your own from what it drinks. The picker keeps every other country a tap away, and Split by Peanut can do the asking afterwards, so the driver never has to raise it in the group chat.',
                ],
            },
            faqs: [
                {
                    question: `What is the official ${row.name} mileage rate?`,
                    answer: `${row.note} That figure was read off ${row.sourceLabel} on ${formatDate(MILEAGE_RATES_RETRIEVED)}, and the page it came from is linked under the picker above.`,
                },
                ...mileageSplitCalculator.faqs,
            ],
            related: [
                { href: `/${mileageSplitCalculator.slug}`, label: 'Mileage split calculator for any country' },
                { href: '/tools', label: 'Every calculator' },
                { href: '/blog/fronting-a-group-trip', label: 'Fronting a group trip without being the bank' },
            ],
            // No translated twin and no hreflang — see the routing note in `tool-routes.ts`.
            locales: undefined,
        },
    }
}

export const MILEAGE_COUNTRY_PAGES: readonly MileageCountryPage[] = MILEAGE_RATES.flatMap((row) =>
    row.rate === null ? [] : [countryPage(row, row.rate)]
)

/**
 * The list the calculator itself carries. These pages are reachable from the site only through it,
 * and a page nothing links to is a page a crawler finds once and never returns to.
 */
export const MILEAGE_COUNTRY_LINKS = {
    title: 'Official rates, country by country',
    links: MILEAGE_COUNTRY_PAGES.map((page) => ({
        href: page.path,
        label: `${page.tool.copy.h1} — ${page.rateWords}`,
    })),
}

/**
 * The country list for the page that owns it, and undefined everywhere else — the country pages
 * are English, so a Spanish reader must not be sent to them.
 */
export const mileageCountryLinks = (slug: string, locale: string) =>
    slug === mileageSplitCalculator.slug && locale === 'en' ? MILEAGE_COUNTRY_LINKS : undefined
