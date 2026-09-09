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
 *
 * **What makes one of these its own page rather than a near-duplicate.** The picker, the arithmetic
 * and the product facts are shared by design; what cannot be shared is the row's `note`, which is
 * the one paragraph of body prose this page has and the other eight do not. So it is promoted out
 * of the picker caption into `copy.method`, and the inherited FAQ list is cut to the two questions
 * that note does not already answer — nine copies of one FAQPage block on one domain is nine
 * chances to rank the wrong URL. A row whose note is thin is a row whose page is thin: the honest
 * fix there is research, not another shared paragraph.
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
                description: `Calculate each passenger’s share using the listed ${row.name} rate of ${rateWords}. Enter the distance and adjust the rate if needed.`,
            },
            copy: {
                ...mileageSplitCalculator.copy,
                h1,
                // The heading above names the country and the picker below prints the row's note, so
                // neither is repeated here. The authority stays out too — half the source labels are
                // bodies and half are statutes, and no one article fits both. The method note cites it.
                intro: [
                    `Enter the distance driven and the number of passengers to calculate what each owes the driver. This page starts with the listed rate of ${rateWords}.`,
                    'Check the rate’s conditions below and agree on what costs to share. You can edit the rate, calculate one from fuel use, or select another country.',
                ],
                // The row's own words, promoted out of the picker caption into prose. This is the
                // only paragraph on the page the other eight do not also carry, so it replaces the
                // shared method note rather than sitting beside it.
                method: {
                    title: `About the ${row.name} mileage rate`,
                    body: [
                        row.note,
                        `Source: ${row.sourceLabel}, checked on ${formatDate(MILEAGE_RATES_RETRIEVED)} and linked beneath the country selector. The calculation multiplies distance by the rate. Add tolls, ferries, parking and other trip expenses separately in your Split room.`,
                    ],
                },
            },
            // Three questions, not five. The four generic ones are the same words on all nine
            // pages, and a FAQPage block repeated verbatim nine times on one domain is nine
            // chances for Google to pick the wrong URL; the two kept are the ones a reader of THIS
            // page still has after the method note above.
            faqs: [
                {
                    question: `What is the official ${row.name} mileage rate?`,
                    answer: `The listed rate is ${rateWords}, from ${row.sourceLabel}, checked on ${formatDate(MILEAGE_RATES_RETRIEVED)}. See the conditions above and the source linked beneath the country selector.`,
                },
                mileageSplitCalculator.faqs[0],
                mileageSplitCalculator.faqs[3],
            ],
            related: [
                { href: `/${mileageSplitCalculator.slug}`, label: 'Mileage split calculator for any country' },
                { href: '/tools', label: 'Every calculator' },
                { href: '/blog/fronting-a-group-trip', label: 'Paying upfront for a group trip' },
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
