import { allocateByWeights, formatFigure, MAX_SAFE_MINOR } from './allocate'
import { MILEAGE_RATES, MILEAGE_RATES_RETRIEVED, MILEAGE_RATES_VERSION, mileageRate } from './mileage-rates'
import type { Tool, ToolChoiceOption, ToolInput, ToolOutcome, ToolWorking } from './types'

/**
 * What a shared car cost, and what each passenger owes the person who drove it.
 *
 * **This is a trip splitter, not a tax calculator.** Nobody typing "mileage split calculator" is
 * filing anything; four people got in a car and one of them is out of pocket. The official rate is
 * here because a fair split needs one number that nobody at the table chose, and a government's
 * published figure is the best available: it prices a car's running costs rather than its petrol,
 * it is dated, and the reader can open the page it came from. It is a default, never a verdict —
 * every rate is pre-filled into an ordinary input the reader can type over.
 *
 * **What "more than fuel" is allowed to claim.** That an official per-distance rate covers more
 * than the pump is safe to say generically and is why these figures sit well above a fuel-only
 * sum. What each authority's rate is composed of is not: the research
 * (`projects/peanut-split/seo/research/mileage-rates.md`) records one country's own words on the
 * point and no more, so nothing here attributes a breakdown to a named government.
 *
 * **The builder is for the reader who rejects the default.** Their alternative used to be typing a
 * guess into the rate box, and a guess is nearly always the petrol and nothing else. So the fold
 * asks what the car drinks, does that arithmetic in front of them, and then offers a second line
 * for the wear and the lost value — visibly separate, so a rate left at the fuel floor is a choice
 * rather than an oversight. Nothing in it reaches `compute`; it writes one number into the rate
 * field on a button press, and the field is ordinary state afterwards.
 *
 * That is also why the annual thresholds are not modelled. The UK's 10,000 miles and Canada's
 * 5,000 kilometres reset each year and no single drive reaches either, so they are stated under
 * the picker and left out of the arithmetic. Modelling them would mean asking how far the car had
 * already gone this year, which is a question about a tax return, on a page about a weekend.
 *
 * The driver is not a row in the table. The table is the people who owe money, and the driver is
 * who they owe it to — until the toggle says the driver takes a share too, at which point one more
 * share appears at the top of the result and the passengers each pay less.
 */

/** The reader can be told there is no rate for their country; a compute function cannot guess one. */
const ELSEWHERE = 'other'

/**
 * A rate the way its government writes it, and never fewer than two decimals.
 *
 * Belgium's is 0.4440 and Germany's is 0.30. Printing either at the currency's own precision would
 * be a different number from the one on the official page, so the rate is a plain figure here
 * rather than a money amount — the currency is named once, by the selector above it.
 */
function rateText(rate: number): string {
    const written = String(rate)
    const places = written.includes('.') ? written.split('.')[1].length : 0
    return rate.toFixed(Math.max(2, places))
}

/** Four decimal places, because a published rate carries them — Belgium's is 0.4440. */
const round4 = (value: number): number => (Number.isFinite(value) ? Math.round(value * 10_000) / 10_000 : 0)

/**
 * A rate assembled from what the car drinks, plus whatever goes on top for the part a fuel receipt
 * never shows.
 *
 * Major units in and major units out, deliberately: a per-distance rate carries more decimals than
 * any currency does, so putting this through the minor-unit boundary would round a real rate into
 * an unreal one before the split ever saw it. Negative answers are read as empty boxes rather than
 * refused — this feeds an input, not a result, and the compute function guards the result.
 */
export function buildCustomRate(values: Record<string, number>): { floor: number; total: number } {
    const litres = Math.max(0, values.fuelPer100 ?? 0)
    const price = Math.max(0, values.fuelPrice ?? 0)
    const wear = Math.max(0, values.wear ?? 0)
    const floor = round4((litres * price) / 100)
    return { floor, total: round4(floor + wear) }
}

function computeMileageSplit({ values, toggles, choices, rows, decimals }: ToolInput): ToolOutcome {
    const empty: ToolOutcome = { shares: [], totalMinor: 0, workings: [] }
    const distance = values.distance ?? 0
    const rate = values.rate ?? 0
    const country = mileageRate(choices.country)
    const perUnit = country?.unit === 'mile' ? 'mile' : 'kilometre'
    const short = country?.unit === 'mile' ? 'mi' : 'km'

    if (rows.length === 0) return { ...empty, problem: 'Say how many people are riding with the driver.' }
    if (!Number.isFinite(distance) || distance < 0) return { ...empty, problem: 'A distance cannot be less than nothing.' } // prettier-ignore
    if (!Number.isFinite(rate) || rate < 0) return { ...empty, problem: 'A rate cannot be less than nothing.' }
    // An empty box is a form the reader has not finished, and the countries with no official rate
    // arrive here on purpose — say which number is missing rather than dividing nothing three ways.
    if (distance === 0) return { ...empty, problem: 'Put in how far the car went.' }
    if (rate === 0) return { ...empty, problem: `Put in a rate for each ${perUnit}.` }

    // The rate is major units and carries more decimals than the currency does, so the money is
    // made here rather than at the input: 0.4440 a kilometre is a real rate and 44.4 cents is not
    // a real amount.
    const cost = Math.round(distance * rate * 10 ** decimals)
    // Past this the doubles stop counting whole cents, and a wrong number is worse than no number.
    if (!Number.isSafeInteger(cost) || cost > MAX_SAFE_MINOR)
        return { ...empty, problem: 'That is a longer drive than this page divides.' }

    const driverToo = toggles.driverShares === true

    const riders = rows.map((row) => Math.max(0, row.values.share ?? 0))
    // The driver's share is one, not a row: the table asks about the people who owe money.
    const weights = driverToo ? [1, ...riders] : riders
    const shareCount = weights.reduce((running, weight) => running + weight, 0)
    if (shareCount <= 0) return { ...empty, problem: 'Every share is set to nothing, so there is nothing to divide.' }

    const amounts = allocateByWeights(cost, weights)
    const passengers = rows.map((row, index) => ({
        label: row.name,
        amountMinor: amounts[driverToo ? index + 1 : index],
        detail: `${formatFigure(riders[index])} of ${formatFigure(shareCount)} shares`,
    }))

    const workings: ToolWorking[] = [
        { label: 'Distance', value: `${formatFigure(distance)} ${short}` },
        { label: `Rate for each ${perUnit}`, value: rateText(rate) },
        { label: 'What the drive cost', amountMinor: cost },
    ]

    return {
        shares: driverToo
            ? [
                  {
                      label: 'The driver',
                      amountMinor: amounts[0],
                      detail: 'their own share, which nobody hands over',
                  },
                  ...passengers,
              ]
            : passengers,
        totalMinor: cost,
        workings,
    }
}

/** One picker option per researched country, plus the row for the countries the research did not cover. */
const countryOptions: readonly ToolChoiceOption[] = [
    ...MILEAGE_RATES.map((row) => ({
        value: row.code,
        label: row.label,
        sets: { rate: row.rate === null ? '' : rateText(row.rate) },
        currency: row.currency,
        note: row.note,
        source: { label: row.sourceLabel, href: row.sourceUrl },
    })),
    {
        value: ELSEWHERE,
        label: 'Somewhere else',
        sets: { rate: '' },
        note: 'No official figure here for that one. Put in what the distance costs the driver, or build one below out of what the car drinks.',
    },
]

export const mileageSplitCalculator: Tool = {
    slug: 'mileage-split-calculator',
    updated: '2026-07-30',
    doodle: 'car',
    register: 'default',
    meta: {
        title: 'Mileage split calculator for a shared car',
        description:
            'Cost a drive at the official mileage rate, which prices the whole car rather than the petrol, and split it between everyone who was in it.',
    },
    copy: {
        h1: 'Mileage split calculator',
        intro: [
            'Say how far the car went and how many people were in it. The drive is costed at the official reimbursement rate for the country you pick, and underneath is what each passenger owes whoever drove.',
            'A fair rate for each kilometre is never the petrol on its own. It is standing in for the tyres, the service that comes round sooner, and the value the car sheds while you are enjoying it — which is why an official figure sits well above what the pump alone would suggest. Type over it if you know the car better than the state does, or build your own from what it drinks. Let Split by Peanut do the asking afterwards, so the driver never has to raise it in the group chat.',
        ],
        resultTitle: 'Who owes the driver what',
        resultHint: 'Say how many people rode with the driver.',
        roundingNote:
            'The cost of a drive rarely divides evenly, so whatever is left at the end goes to the largest fractions first, one unit each. The column adds up to what the drive cost exactly.',
        copyLabel: 'Copy the list',
        copyDone: 'Copied',
        method: {
            title: 'What the rate leaves for the receipts',
            body: [
                'It prices distance and nothing else. Tolls, ferries, parking and the coffee at the services sit outside it, and they have receipts of their own. Those belong in the room with the rest of the trip.',
                'It does not pay anybody for driving, either. Four hours at the wheel is a real thing to have done and no per-kilometre figure prices it. Groups tend to settle that with the front seat and the choice of music, and the ones that try to settle it with money rarely enjoy the conversation.',
            ],
        },
        concession: {
            title: 'When the fuel receipt is the better tool',
            body: 'One tank, one receipt, one drive: divide what the pump charged and stop there. A rate for each kilometre earns its keep on a car somebody owns, where the cost is spread across years of servicing nobody kept the paperwork for. On a hire car the invoice plus the fuel is the truer number, and it is already written down.',
        },
        goodToKnow: {
            title: 'Good to know',
            body: [
                'Split is free forever, with nothing to upgrade to.',
                'Twelve currencies, converted at the day’s rate.',
                'A room holds up to twenty people.',
                'Split records a payment rather than making one. It does not check with a bank and cannot.',
            ],
        },
        cta: {
            title: 'The fuel was not the only thing somebody paid for',
            body: 'Takes ten seconds. No email, no password, no download.',
            label: 'Start a split',
        },
        faqTitle: 'Questions',
    },
    choices: [
        {
            name: 'country',
            label: 'Country',
            help: 'Sets the rate below. Every rate here was read off that government’s own page in July 2026, linked under the picker.',
            defaultValue: 'GB',
            options: countryOptions,
        },
    ],
    fields: [
        {
            name: 'distance',
            kind: 'number',
            label: 'Distance driven',
            help: 'The whole drive, both ways if everyone came home again. In the unit the picker names.',
            defaultValue: 300,
            min: 0,
            step: 1,
        },
        {
            name: 'rate',
            kind: 'number',
            label: 'Rate for each mile or kilometre',
            help: 'Picking a country fills this in and switches the currency with it. Type over it with what the car actually costs to run.',
            defaultValue: 0.55,
            min: 0,
            step: 0.01,
        },
        {
            name: 'passengers',
            kind: 'count',
            label: 'Passengers',
            help: 'Everyone in the car except the driver.',
            defaultValue: 3,
            min: 1,
            max: 8,
        },
        {
            name: 'driverShares',
            kind: 'toggle',
            label: 'The driver takes a share too',
            help: 'Left off, the passengers cover the drive between them.',
            defaultValue: 0,
        },
    ],
    rows: {
        countField: 'passengers',
        nameLabel: 'Name',
        namePrefix: 'Passenger',
        columns: [
            {
                name: 'share',
                kind: 'number',
                label: 'Share',
                help: 'One is an even share. A half for somebody who only rode one way.',
                defaultValue: 1,
                min: 0,
                step: 0.5,
            },
        ],
    },
    builder: {
        target: 'rate',
        title: 'Build a rate of your own',
        summary: 'Start from what the car drinks',
        intro: 'Two numbers off the dashboard give the fuel. Fuel is the floor rather than the answer, though — the car also wears out, gets serviced, and is worth less at the end of the year than it was at the start.',
        fields: [
            {
                name: 'fuelPer100',
                kind: 'number',
                label: 'Fuel it uses every 100',
                unit: 'litres',
                help: 'Per 100 in the unit the picker above is set to, miles or kilometres.',
                defaultValue: 7,
                min: 0,
                step: 0.1,
            },
            {
                name: 'fuelPrice',
                kind: 'number',
                label: 'What a litre costs',
                help: 'In the currency above. The price on the sign, not the loyalty one.',
                defaultValue: 1.6,
                min: 0,
                step: 0.01,
            },
            {
                name: 'wear',
                kind: 'number',
                label: 'Wear and lost value on top',
                help: 'For each mile or kilometre. The part no fuel receipt shows: tyres, the service that comes round sooner, the car being worth less than it was. Left at nothing, this prices the petrol and calls it a day.',
                defaultValue: 0,
                min: 0,
                step: 0.01,
            },
        ],
        floorLabel: 'Fuel alone',
        totalLabel: 'The rate this writes in',
        applyLabel: 'Use this rate',
        appliedLabel: 'In the box above',
        derive: buildCustomRate,
    },
    data: {
        version: MILEAGE_RATES_VERSION,
        retrievedAt: MILEAGE_RATES_RETRIEVED,
        rows: MILEAGE_RATES,
    },
    related: [
        { href: '/blog/fronting-a-group-trip', label: 'Fronting a group trip without being the bank' },
        { href: '/group-trip-expenses', label: 'Group trip expenses without a spreadsheet' },
        { href: '/blog/split-a-group-trip-across-countries', label: 'Splitting a trip across countries' },
    ],
    faqs: [
        {
            question: 'Why split petrol at a government mileage rate?',
            answer: 'Because it is the one number in the car that nobody in the car chose. Each of these is a government’s working estimate of what a distance in a private car costs whoever owns it, and it is published, dated and open to be read. Splitting the pump receipt alone quietly undercharges the owner, and doing the depreciation sums yourself over a weekend away is how a lift turns into a grievance.',
        },
        {
            question: 'What if the car is hired rather than somebody’s own?',
            answer: 'Then the rate has nothing to add. A hire company has already priced the wear into the day rate, so the honest number is the hire invoice plus whatever went into the tank, and both of those are receipts you can put in a room as ordinary expenses. Rates for each kilometre exist for the car that has no invoice, because it belongs to one of you.',
        },
        {
            question: 'What should a per-kilometre rate include besides petrol?',
            answer: 'Everything the distance uses up rather than everything the day costs. Fuel is the part with a receipt, and it is the smaller part: tyres wear, the service interval arrives sooner, and a car with more miles on it is worth less than the same car without them. That is why the builder here shows the fuel on its own line and then asks what goes on top. A rate left at the fuel floor charges the driver for the petrol and hands them the rest.',
        },
        {
            question: 'Should the driver pay a share of the mileage too?',
            answer: 'Both arrangements are ordinary, and the toggle does whichever you tell it. Left as it is, the passengers cover the drive between them, which is the usual reading of a lift: one person supplies the car, the others supply the money. Turned on, the driver takes an equal share alongside everyone else, which reads fairer when the car is doing a job for the whole group rather than a favour for the passengers.',
        },
    ],
    compute: computeMileageSplit,
}
