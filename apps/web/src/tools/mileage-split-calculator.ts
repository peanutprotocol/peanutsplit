import { allocateByWeights, formatFigure, MAX_SAFE_MINOR } from './allocate'
import { MILEAGE_RATES, MILEAGE_RATES_RETRIEVED, MILEAGE_RATES_VERSION, mileageRate } from './mileage-rates'
import { mileageSplitEs419, mileageSplitPtBr } from './mileage-split-calculator.locales'
import { fill } from './phrases'
import type { Tool, ToolChoiceOption, ToolInput, ToolOutcome, ToolWorking } from './types'
import type { IndexedLocale } from '@/i18n/locales'

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
 * rather than a money amount — the currency is named once, by the selector above it. Written in the
 * input's convention in every language: it is the string the picker types into the rate box, and
 * `kind: 'number'` fields parse with `Number()`.
 */
export function rateText(rate: number): string {
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

function computeMileageSplit({ values, toggles, choices, rows, decimals, phrases, locale }: ToolInput): ToolOutcome {
    const empty: ToolOutcome = { shares: [], totalMinor: 0, workings: [] }
    const distance = values.distance ?? 0
    const rate = values.rate ?? 0
    const country = mileageRate(choices.country)
    // The unit is a word in the sentence and a symbol beside a figure. The word is copy; `mi` and
    // `km` are international symbols and stay put.
    const perUnit = country?.unit === 'mile' ? phrases.unitMile : phrases.unitKilometre
    const short = country?.unit === 'mile' ? 'mi' : 'km'

    if (rows.length === 0) return { ...empty, problem: phrases.noRiders }
    if (!Number.isFinite(distance) || distance < 0) return { ...empty, problem: phrases.negativeDistance }
    if (!Number.isFinite(rate) || rate < 0) return { ...empty, problem: phrases.negativeRate }
    // An empty box is a form the reader has not finished, and the countries with no official rate
    // arrive here on purpose — say which number is missing rather than dividing nothing three ways.
    if (distance === 0) return { ...empty, problem: phrases.noDistance }
    if (rate === 0) return { ...empty, problem: fill(phrases.noRate, { unit: perUnit }) }

    // The rate is major units and carries more decimals than the currency does, so the money is
    // made here rather than at the input: 0.4440 a kilometre is a real rate and 44.4 cents is not
    // a real amount.
    const cost = Math.round(distance * rate * 10 ** decimals)
    // Past this the doubles stop counting whole cents, and a wrong number is worse than no number.
    if (!Number.isSafeInteger(cost) || cost > MAX_SAFE_MINOR) return { ...empty, problem: phrases.driveTooLong }

    const driverToo = toggles.driverShares === true

    const riders = rows.map((row) => Math.max(0, row.values.share ?? 0))
    // The driver's share is one, not a row: the table asks about the people who owe money.
    const weights = driverToo ? [1, ...riders] : riders
    const shareCount = weights.reduce((running, weight) => running + weight, 0)
    if (shareCount <= 0) return { ...empty, problem: phrases.noShares }

    const amounts = allocateByWeights(cost, weights)
    const passengers = rows.map((row, index) => ({
        label: row.name,
        amountMinor: amounts[driverToo ? index + 1 : index],
        detail: fill(phrases.shareDetail, {
            share: formatFigure(riders[index], locale),
            total: formatFigure(shareCount, locale),
        }),
    }))

    const workings: ToolWorking[] = [
        { label: phrases.distanceLabel, value: `${formatFigure(distance, locale)} ${short}` },
        { label: fill(phrases.rateLabel, { unit: perUnit }), value: rateText(rate) },
        { label: phrases.costLabel, amountMinor: cost },
    ]

    return {
        shares: driverToo
            ? [{ label: phrases.driverLabel, amountMinor: amounts[0], detail: phrases.driverDetail }, ...passengers]
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
        note: 'No official rate is listed for this country. Enter an agreed rate or calculate one below from fuel use and other running costs.',
    },
]

export const mileageSplitCalculator: Tool = {
    slug: 'mileage-split-calculator',
    updated: '2026-08-22',
    doodle: 'car',
    register: 'default',
    meta: {
        title: 'Mileage split calculator for a shared car',
        description:
            'Calculate each passenger’s share of a drive. Use a listed mileage rate or enter your own, and choose whether the driver pays a share.',
    },
    copy: {
        h1: 'Mileage split calculator',
        intro: [
            'Enter the distance driven and the number of passengers to calculate what each person owes the driver. Choose a country to use a listed reimbursement rate, or enter your own.',
            'A mileage rate can include running costs beyond fuel. Agree on what to share before using the result. The rate builder below lets you calculate fuel cost and add an amount for wear and lost value.',
        ],
        resultTitle: 'Who owes the driver what',
        resultHint: 'Enter the number of passengers, excluding the driver.',
        roundingNote:
            'Each share is rounded down, then any remaining amount goes to the largest fractions, one smallest currency unit at a time. The shares add up to the calculated trip cost.',
        copyLabel: 'Copy the list',
        copyDone: 'Copied',
        method: {
            title: 'Costs to add separately',
            body: [
                'The calculation multiplies distance by the rate. Add tolls, ferries, parking and other trip expenses separately in your Split room.',
                'It does not add a payment for the driver’s time. If your group wants to include one, agree on it separately.',
            ],
        },
        concession: {
            title: 'Sharing fuel or a hire car',
            body: 'If the group only wants to share fuel, divide the fuel used for the trip. For a hire car, use the rental invoice and fuel expenses instead of adding a mileage rate for the owner’s running costs.',
        },
        goodToKnow: {
            title: 'Good to know',
            body: [
                'The official service is free to use and has no paid tier.',
                'Automatic conversion for 156 currencies at the day’s indicative rate.',
                'A room holds up to twenty people.',
                'Split records payments. It does not send money or verify payments with a bank.',
            ],
        },
        cta: {
            title: 'Track the rest of the trip expenses',
            body: 'Create a room and share the link with the group. No account or download required.',
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
    // Each chip wears its option's own label, so this adds no copy to gate or to translate.
    presets: [
        { choiceName: 'country', optionValue: 'GB' },
        { choiceName: 'country', optionValue: 'US' },
        { choiceName: 'country', optionValue: 'DE' },
    ],
    fields: [
        {
            name: 'distance',
            kind: 'number',
            label: 'Distance driven',
            help: 'Include the return journey if it is shared. Use the miles or kilometres shown for the selected country.',
            defaultValue: 300,
            min: 0,
            step: 1,
        },
        {
            name: 'rate',
            kind: 'number',
            label: 'Rate for each mile or kilometre',
            help: 'Selecting a country sets the currency and fills in a rate where one is listed. You can edit the rate.',
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
                help: 'Use 1 for a full share, or 0.5 for someone who travelled half the distance.',
                defaultValue: 1,
                min: 0,
                step: 0.5,
            },
        ],
    },
    builder: {
        target: 'rate',
        title: 'Build a rate of your own',
        summary: 'Calculate a rate from fuel use',
        intro: 'Enter fuel consumption and the price per litre to calculate fuel cost per mile or kilometre. Add an agreed amount for wear and lost value if you want to share those costs too.',
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
                help: 'Enter the price paid per litre in the selected currency.',
                defaultValue: 1.6,
                min: 0,
                step: 0.01,
            },
            {
                name: 'wear',
                kind: 'number',
                label: 'Wear and lost value on top',
                help: 'An additional amount per mile or kilometre for costs such as tyres, servicing and depreciation. Leave at zero to calculate fuel only.',
                defaultValue: 0,
                min: 0,
                step: 0.01,
            },
        ],
        floorLabel: 'Fuel alone',
        totalLabel: 'Calculated rate',
        applyLabel: 'Use this rate',
        appliedLabel: 'Rate applied',
        derive: buildCustomRate,
    },
    data: {
        version: MILEAGE_RATES_VERSION,
        retrievedAt: MILEAGE_RATES_RETRIEVED,
        rows: MILEAGE_RATES,
    },
    phrases: {
        noRiders: 'Enter the number of passengers, excluding the driver.',
        negativeDistance: 'Distance must be a non-negative number.',
        negativeRate: 'The rate must be a non-negative number.',
        noDistance: 'Enter the distance driven.',
        noRate: 'Enter a rate for each {unit}.',
        driveTooLong: 'The calculated cost exceeds this calculator’s limit.',
        noShares: 'Set at least one share above zero.',
        unitMile: 'mile',
        unitKilometre: 'kilometre',
        distanceLabel: 'Distance',
        rateLabel: 'Rate for each {unit}',
        costLabel: 'What the drive cost',
        shareDetail: '{share} of {total} shares',
        driverLabel: 'The driver',
        driverDetail: 'cost covered by the driver',
    },
    locales: { 'es-419': mileageSplitEs419, 'pt-br': mileageSplitPtBr },
    related: [
        { href: '/blog/fronting-a-group-trip', label: 'Paying upfront for a group trip' },
        { href: '/group-trip-expenses', label: 'Track group trip expenses' },
        { href: '/blog/split-a-group-trip-across-countries', label: 'Splitting a trip across countries' },
    ],
    faqs: [
        {
            question: 'Why use a government mileage rate for a shared trip?',
            answer: 'A published rate gives the group a reference for running costs beyond fuel. Check the source and date beneath the country selector: the rate’s purpose and conditions vary by country. You can edit it to use an amount the group agrees on. This calculator divides trip costs; it does not calculate a tax claim.',
        },
        {
            question: 'What if the car is hired rather than somebody’s own?',
            answer: 'Use the rental invoice, fuel used and other trip expenses. Adding a mileage rate for wear on top of the hire charge can count the same cost twice. Record the actual expenses in your Split room.',
        },
        {
            question: 'What should a per-kilometre rate include besides petrol?',
            answer: 'If the group wants to share more than fuel, agree on an amount for wear, servicing and depreciation. The rate builder adds that amount to the fuel cost per mile or kilometre. Leave the extra amount at zero for a fuel-only calculation.',
        },
        {
            question: 'Should the driver pay a share of the mileage too?',
            answer: 'The group decides. By default, the passengers cover the full calculated cost. Turn on the driver toggle to give the driver one share as well. Passenger shares remain adjustable, so someone who travelled half the distance can take half a share.',
        },
    ],
    compute: computeMileageSplit,
}
