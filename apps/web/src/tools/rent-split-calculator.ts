import { allocateByWeights, formatFigure, formatShareOfWhole, MAX_SAFE_MINOR } from './allocate'
import { fill } from './phrases'
import { rentSplitEs419, rentSplitPtBr } from './rent-split-calculator.locales'
import type { Tool, ToolInput, ToolOutcome, ToolWorking } from './types'

/** Equal contribution weights cancel out, leaving rent proportional to private room area. */

const EQUAL = (count: number) => 1 / count

/** Contribution weights use the five positions available on the slider. */
const TOP_NOTCH = 5
const notchOf = (value: number): number => Math.min(TOP_NOTCH, Math.max(1, Math.round(value) || 1))

function computeRentSplit({ values, rows, phrases, locale }: ToolInput): ToolOutcome {
    const rent = Math.trunc(values.rent ?? 0)
    const empty: ToolOutcome = { shares: [], totalMinor: 0, workings: [] }

    if (rows.length === 0) return { ...empty, problem: phrases.noPeople }
    if (rent < 0) return { ...empty, problem: phrases.negativeRent }
    if (!Number.isSafeInteger(rent) || rent > MAX_SAFE_MINOR) return { ...empty, problem: phrases.rentTooBig }

    const sizes = rows.map((row) => Math.max(0, row.values.size ?? 0))
    const notches = rows.map((row) => notchOf(row.values.rich ?? 1))
    const floorArea = sizes.reduce((running, size) => running + size, 0)

    // Unmeasured rooms count equally when no room area has been entered.
    const roomShares = sizes.map((size) => (floorArea > 0 ? size / floorArea : EQUAL(rows.length)))

    // Multiplication preserves room-size proportions whenever all contribution weights match.
    const scaled = roomShares.map((room, index) => room * notches[index])
    const scaledTotal = scaled.reduce((running, weight) => running + weight, 0)
    const weights = scaled.map((weight) => weight / scaledTotal)
    const tilted = notches.some((notch) => notch !== notches[0])

    const amounts = allocateByWeights(rent, weights)
    const workings: ToolWorking[] = [
        { label: phrases.rentLabel, amountMinor: rent },
        { label: phrases.floorAreaLabel, value: fill(phrases.areaValue, { area: formatFigure(floorArea, locale) }) },
    ]
    if (tilted) workings.push({ label: phrases.slidersLabel, value: notches.join(', ') })

    return {
        shares: rows.map((row, index) => ({
            label: row.name,
            amountMinor: amounts[index],
            detail: tilted
                ? fill(phrases.detailTilted, {
                      room: formatShareOfWhole(roomShares[index], 1, locale),
                      notch: notches[index],
                      share: formatShareOfWhole(weights[index], 1, locale),
                  })
                : fill(phrases.detailPlain, {
                      size: formatFigure(sizes[index], locale),
                      share: formatShareOfWhole(roomShares[index], 1, locale),
                  }),
        })),
        totalMinor: rent,
        workings,
    }
}

export const rentSplitCalculator: Tool = {
    slug: 'rent-split-calculator',
    updated: '2026-09-10',
    doodle: 'house',
    register: 'default',
    meta: {
        title: 'Rent split calculator by room size',
        description:
            'Calculate each flatmate’s rent from their room size. Adjust the weights by agreement and see amounts that add up to the total rent.',
    },
    copy: {
        h1: 'Split rent by room size',
        intro: ['Enter the monthly rent and each private room’s size to see what everyone pays.'],
        inputTitle: '1. Monthly rent',
        rowsTitle: '2. Room sizes',
        rowsHelp: 'Enter each private room’s area. Leave shared spaces out. Names are optional.',
        optionalTitle: 'Adjust contributions (optional)',
        optionalHelp:
            'Equal weights split rent by room size alone. Agree on any changes together: a higher weight increases that person’s share.',
        resultTitle: 'Monthly rent per person',
        resultHint: 'Enter the monthly rent and the number of people sharing it.',
        roundingNote: 'Rounding is adjusted so the shares add up to the total rent.',
        copyLabel: 'Copy the split',
        copyDone: 'Copied',
        method: {
            title: 'What room size leaves out',
            body: [
                'This calculator assigns the whole rent by private room size. It excludes shared areas such as the kitchen and living room, which can make bedroom differences count for too much. It also leaves out features such as an en suite or better light.',
                'If you want to account for shared space, agree on a portion of the rent to divide equally and divide the rest by bedroom size. You can record that calculation in a spreadsheet. An equal split may be enough when the rooms are similar.',
            ],
        },
        concession: {
            title: 'Agree on the split before paying',
            body: 'Use the result as a starting point for your household’s agreement. Optional contribution weights multiply each room’s area. Save the amounts you agree on for each month.',
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
            title: 'Track shared household expenses',
            body: 'Create a room and share the link with your flatmates. No account or download required.',
            label: 'Start a split',
        },
        faqTitle: 'Questions',
    },
    fields: [
        { name: 'rent', kind: 'amount', label: 'Total monthly rent', defaultValue: 1500, min: 0, currency: true },
        { name: 'people', kind: 'count', label: 'People sharing rent', defaultValue: 3, min: 1, max: 20 },
    ],
    rows: {
        countField: 'people',
        nameLabel: 'Name',
        namePrefix: 'Flatmate',
        columns: [
            {
                name: 'size',
                kind: 'number',
                label: 'Room size',
                unit: 'm²',
                defaultValue: 14,
                min: 0,
                step: 0.5,
            },
            {
                name: 'rich',
                kind: 'scale',
                label: 'Contribution weight',
                defaultValue: 3,
                notches: ['1×', '2×', '3×', '4×', '5×'],
            },
        ],
    },
    related: [
        { href: '/splitwise-alternative', label: 'How Split compares to Splitwise' },
        { href: '/tools', label: 'All calculators' },
    ],
    phrases: {
        noPeople: 'Enter the number of flatmates.',
        negativeRent: 'Rent cannot be negative.',
        rentTooBig: 'The rent exceeds this calculator’s limit.',
        rentLabel: 'Rent',
        floorAreaLabel: 'Total private room area',
        areaValue: '{area} m²',
        slidersLabel: 'Contribution weights',
        detailTilted: '{room} of room area · {notch}× weight · {share} of rent',
        detailPlain: '{size} m² · {share} of rent',
    },
    locales: { 'es-419': rentSplitEs419, 'pt-br': rentSplitPtBr },
    faqs: [
        {
            question: 'How do you split rent by room size?',
            answer: 'Divide each private room’s area by the total private room area, then multiply by the rent. The calculator uses this method by default. Shared areas are excluded, so consider whether you want to divide part of the rent equally to account for them.',
        },
        {
            question: 'How do optional contribution weights work?',
            answer: 'Open “Adjust contributions” to set a weight from 1× to 5× for each person. The calculator multiplies each room’s area by its weight, then splits the rent in those proportions. Equal weights cancel out, so rent follows room size alone. If every room size is zero, the calculator starts with equal room shares.',
        },
        {
            question: 'How do you split rent when one flatmate earns more?',
            answer: 'If everyone agrees that the higher earner should contribute more, open “Adjust contributions” and raise their weight. The calculator multiplies their room’s area by that weight. It does not use income figures. Leave all weights equal to split by room size alone.',
        },
        {
            question: 'Why does one flatmate pay a fraction more than the others?',
            answer: 'Rounding can leave a small amount unallocated. The calculator rounds each share down, then distributes the remainder to the largest fractions, one smallest currency unit at a time. This keeps the total equal to the rent.',
        },
    ],
    compute: computeRentSplit,
}
