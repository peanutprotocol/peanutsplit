import type { ToolDataRow } from './types'

/**
 * Official per-distance reimbursement rates, one row per country, each read off the government's
 * own page on 30 July 2026.
 *
 * **What this file is for.** The mileage tool is a trip-cost splitter, not a tax calculator. It
 * needs one credible number that nobody in the car chose, and a government's published rate is the
 * best available: it is an estimate of what a kilometre in a private car costs its owner, it is
 * dated, and it is checkable. Every row therefore carries the page it came from, and the reader is
 * always free to type over the number.
 *
 * **Why some countries have no rate here.** A rate ships only where the official structure reduces
 * honestly to one figure a single trip can be costed at. Three shapes fail that test:
 *
 * - **France** publishes a scale keyed to fiscal horsepower whose middle band is a per-kilometre
 *   coefficient plus a fixed sum. There is no €/km in it, and the bands are selected rather than
 *   marginal, so applying them the way the UK's or Canada's tiers work gives wrong answers.
 * - **Ireland**'s civil-service bands depend on how far the car has already gone this calendar
 *   year, and they rise before they fall. A single trip has no rate of its own.
 * - **Poland** publishes a per-kilometre maximum in złoty, one of the 158 currencies this site
 *   converts. The published value is still a useful note rather than a universal default.
 *
 * **Brazil is a verified negative, not a gap.** The federal instrument (Decreto 3.184/1999, art. 2)
 * pays a daily maximum with no distance term in it. There is no national per-kilometre rate to
 * ship, and the local and sectoral figures that exist are not a substitute for one.
 *
 * **What is deliberately not modelled.** The UK's 10,000-mile and Canada's 5,000-km thresholds
 * reset annually and a single trip does not reach either, so they are stated in the note and left
 * out of the arithmetic. Australia's 5,000-km method cap, Canada's tax-year label, the UK's
 * passenger supplement, Ireland's electric-vehicle column, France's two-wheeler scales and the
 * Dutch employer-side framing were not read off a first-party page in the research session and are
 * therefore absent — the research recorded them as unverified, and an unverified sub-field on a
 * page that cites its sources is worse than a missing one.
 */

export interface MileageRate extends ToolDataRow {
    /** ISO 3166-1 alpha-2, or `other` for the country this list does not cover. */
    code: string
    /** As the picker prints it, with the distance unit named so the reader knows what to type. */
    label: string
    /** Distance the rate is quoted per. Decides the wording of the working and the input's unit. */
    unit: 'km' | 'mile'
    /**
     * Major units per unit of distance, or null where no single figure honestly falls out of the
     * official structure. Null rows start on an empty box rather than on a guess.
     */
    rate: number | null
    /** Currency the rate is quoted in, and the currency the shell switches to. */
    currency?: string
    /** What the number is and what it leaves out. Printed under the picker. */
    note: string
    /** The authority and its domain, printed as the link to the page above. */
    sourceLabel: string
}

/** Bumped whenever a rate changes, so a cached answer can be told from a current one. */
export const MILEAGE_RATES_VERSION = '2026-07-30'

/** The date every page below was opened. Not the date this file was last edited. */
export const MILEAGE_RATES_RETRIEVED = '2026-07-30'

/** Alphabetical by country, with the country this list does not cover last. */
export const MILEAGE_RATES: readonly MileageRate[] = [
    {
        code: 'AU',
        label: 'Australia (kilometres)',
        unit: 'km',
        rate: 0.91,
        currency: 'AUD',
        note: '0.91 AUD a kilometre, for the income year that starts on 1 July 2026. The year before it was 0.88.',
        sourceLabel: 'Federal Register of Legislation (legislation.gov.au)',
        sourceUrl: 'https://www.legislation.gov.au/F2026L00785/asmade/2026-06-23/text/original/pdf',
    },
    {
        code: 'BE',
        label: 'Belgium (kilometres)',
        unit: 'km',
        rate: 0.444,
        currency: 'EUR',
        note: '0.4440 EUR a kilometre, for 1 July to 30 September 2026. Belgium revises this every quarter and has lately revised it month by month, so read the date before you lean on the number.',
        sourceLabel: 'Federal public service BOSA (bosa.belgium.be)',
        sourceUrl:
            'https://bosa.belgium.be/fr/themes/travailler-dans-la-fonction-publique/remuneration-et-avantages/allocations-et-indemnites-13',
    },
    {
        code: 'BR',
        label: 'Brazil (kilometres)',
        unit: 'km',
        rate: null,
        currency: 'BRL',
        note: 'Brazil has no federal rate for each kilometre. The federal rule pays a daily maximum with no distance in it, so there is nothing here to divide a drive by. Put in what the car costs to run.',
        sourceLabel: 'Presidência da República (planalto.gov.br)',
        sourceUrl: 'https://www.planalto.gov.br/ccivil_03/decreto/d3184.htm',
    },
    {
        code: 'CA',
        label: 'Canada (kilometres)',
        unit: 'km',
        rate: 0.72,
        currency: 'CAD',
        note: '0.72 CAD a kilometre for the first 5,000 kilometres of a year, and 0.66 after that. One drive stays inside the first band, so this page costs the whole trip at 0.72.',
        sourceLabel: 'Income Tax Regulations s. 7306 (laws-lois.justice.gc.ca)',
        sourceUrl: 'https://laws-lois.justice.gc.ca/eng/regulations/C.R.C.,_c._945/section-7306.html',
    },
    {
        code: 'FR',
        label: 'France (kilometres)',
        unit: 'km',
        rate: null,
        currency: 'EUR',
        note: 'France publishes a scale rather than a rate. It is keyed to the car’s fiscal horsepower, and its middle band adds a fixed sum on top of a per-kilometre figure, so no single number falls out of it. Put in what the car costs to run.',
        sourceLabel: 'Service-Public (service-public.gouv.fr)',
        sourceUrl: 'https://www.service-public.gouv.fr/particuliers/actualites/A14686',
    },
    {
        code: 'DE',
        label: 'Germany (kilometres)',
        unit: 'km',
        rate: 0.2,
        currency: 'EUR',
        note: '0.20 EUR a kilometre, the travel rate for a car under § 5(1) of the federal travel-expenses act, capped at 130 EUR for the journey. The 0.30 rate is § 5(2), and it only applies where a substantial official interest in taking a car was put in writing before the trip. The 0.38 commuting allowance is a third regime, counted one way between home and work, and it is not this one.',
        sourceLabel: 'Bundesreisekostengesetz § 5 (gesetze-im-internet.de)',
        sourceUrl: 'https://www.gesetze-im-internet.de/brkg_2005/__5.html',
    },
    {
        code: 'IE',
        label: 'Ireland (kilometres)',
        unit: 'km',
        rate: null,
        currency: 'EUR',
        note: 'Ireland’s rates move in bands that depend on how far the car has already gone this year, and they rise before they fall. One trip has no rate of its own. Put in what the car costs to run.',
        sourceLabel: 'Revenue (revenue.ie)',
        sourceUrl:
            'https://www.revenue.ie/en/employing-people/employee-expenses/travel-and-subsistence/civil-service-rates.aspx',
    },
    {
        code: 'NL',
        label: 'Netherlands (kilometres)',
        unit: 'km',
        rate: 0.25,
        currency: 'EUR',
        note: '0.25 EUR a kilometre for 2026, up from 0.23 the year before and backdated to 1 January.',
        sourceLabel: 'Belastingdienst (belastingdienst.nl)',
        sourceUrl:
            'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/inkomstenbelasting/veranderingen-inkomstenbelasting-2026/zakelijk-gebruik-privevervoermiddel-2026',
    },
    {
        code: 'PL',
        label: 'Poland (kilometres)',
        unit: 'km',
        rate: null,
        note: 'Poland’s published maximum is 1.15 PLN a kilometre for an engine over 900 cm³, and 0.89 PLN below it. The złoty is one of the 158 currencies Split converts.',
        sourceLabel: 'Dziennik Ustaw 2023 poz. 5 (dziennikustaw.gov.pl)',
        sourceUrl: 'https://dziennikustaw.gov.pl/D2023000000501.pdf',
    },
    {
        code: 'ES',
        label: 'Spain (kilometres)',
        unit: 'km',
        rate: 0.26,
        currency: 'EUR',
        note: '0.26 EUR a kilometre, in force since July 2023. Tolls and parking sit outside it and are receipts of their own.',
        sourceLabel: 'Boletín Oficial del Estado (boe.es)',
        sourceUrl: 'https://www.boe.es/buscar/act.php?id=BOE-A-2023-16461',
    },
    {
        code: 'GB',
        label: 'United Kingdom (miles)',
        unit: 'mile',
        rate: 0.55,
        currency: 'GBP',
        note: '0.55 GBP a mile, from 6 April 2026. It is the approved rate for the first 10,000 miles of a tax year and 0.25 after that, and one drive does not reach the line.',
        sourceLabel: 'HM Revenue & Customs (gov.uk)',
        sourceUrl:
            'https://www.gov.uk/government/publications/rates-and-allowances-travel-mileage-and-fuel-allowances/travel-mileage-and-fuel-rates-and-allowances',
    },
    {
        code: 'US',
        label: 'United States (miles)',
        unit: 'mile',
        rate: 0.76,
        currency: 'USD',
        note: '0.76 USD a mile, for drives from 1 July 2026. The rate was revised in the middle of the year, so the first half of 2026 is 0.725 and the date of the drive decides which one applies.',
        sourceLabel: 'Internal Revenue Service (irs.gov)',
        sourceUrl: 'https://www.irs.gov/tax-professionals/standard-mileage-rates',
    },
]

/**
 * The row for a picked country, or undefined for the countries this list does not cover.
 *
 * There is no catch-all row in the list on purpose: every row here carries the page it was read
 * off, and a row for "somewhere else" would have had to carry a made-up one. The picker's escape
 * hatch is written where it belongs, in the tool's copy.
 */
export function mileageRate(code: string | undefined): MileageRate | undefined {
    return MILEAGE_RATES.find((row) => row.code === code)
}
