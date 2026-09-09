import { allocateByWeights, formatFigure, formatShareOfWhole, MAX_SAFE_MINOR } from './allocate'
import { fill } from './phrases'
import { rentSplitEs419, rentSplitPtBr } from './rent-split-calculator.locales'
import type { Tool, ToolInput, ToolOutcome, ToolWorking } from './types'

/**
 * Rent by room size, with a slider per person weighting the room they got.
 *
 * **The slider replaced a box asking for a monthly income.** Nobody types their real pay into a
 * marketing page, and the ones who would have to look it up first — so the honest instrument is
 * five labelled notches the whole flat can argue about out loud. It is not a proxy for a salary and
 * does not pretend to be one; it is a relative weight, and the FAQ says exactly what the notch does.
 *
 * **Leave every slider alone and it does nothing.** The notch multiplies the room rather than being
 * averaged against it, so a flat where all five notches match is a flat where the multiplier cancels
 * out of every line exactly: the rent follows floor area and only floor area. Move one up and that
 * person's number goes up and everybody else's comes down, which is the only direction a control
 * like this can honestly move in. Averaging the room share against each notch's share of the flat's
 * notches — what this did until 31 Jul — dragged every result back toward an even split instead, so
 * marking the biggest room as the flush one took money off them. There is no toggle behind any of
 * it, and nothing to cross: level sliders and multiplied sliders are the same arithmetic.
 *
 * The copy explains the calculation and its limits. The household chooses the weights.
 */

const EQUAL = (count: number) => 1 / count

/** Five notches, and the notch is the weight. Off the scale in either direction is not a notch. */
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

    // No floor area is a request for the equal answer rather than an error: with nothing measured,
    // every room counts the same.
    const roomShares = sizes.map((size) => (floorArea > 0 ? size / floorArea : EQUAL(rows.length)))

    // The notch multiplies the room. A flat that has not moved a slider has said nothing about who
    // is flush, and multiplying every room by the same number divides back out exactly, so nothing
    // is invented. Pushing one slider up scales that room and dilutes the rest — the only direction
    // the control claims to move in. Averaging the two shares moved the biggest room the other way.
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
    updated: '2026-07-30',
    doodle: 'house',
    register: 'default',
    meta: {
        title: 'Rent split calculator by room size',
        description:
            'Calculate each flatmate’s rent from their room size. Adjust the weights by agreement and see amounts that add up to the total rent.',
    },
    copy: {
        h1: 'Rent split calculator by room size',
        intro: [
            'Enter the monthly rent and each person’s private room size to calculate their share. The results update as you type.',
            'Keep the sliders at the same level to split by room size alone. To adjust for what each person can afford, agree on different slider levels together. A higher level gives that room more weight.',
        ],
        resultTitle: 'What each room pays',
        resultHint: 'Enter the monthly rent and the number of flatmates.',
        roundingNote:
            'Each share is rounded down, then any remaining amount goes to the largest fractions, one smallest currency unit at a time. The shares add up to the total rent.',
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
            body: 'Use the result as a starting point for the household’s agreement. The sliders are relative weights, not income calculations. Save the agreed amounts so everyone has the same record each month.',
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
        { name: 'rent', kind: 'amount', label: 'Rent for the month', defaultValue: 1500, min: 0 },
        { name: 'people', kind: 'count', label: 'Flatmates', help: 'Up to twenty.', defaultValue: 3, min: 1, max: 20 },
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
                unit: 'sqm',
                help: 'Private space only. Shared rooms stay out of the sum.',
                defaultValue: 14,
                min: 0,
                step: 0.5,
            },
            {
                name: 'rich',
                kind: 'scale',
                label: 'How rich',
                defaultValue: 3,
                notches: ['Broke-ish', 'Getting by', 'Comfortable', 'Doing well', 'Doing very nicely'],
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
        floorAreaLabel: 'Floor area measured',
        areaValue: '{area} sqm',
        slidersLabel: 'Slider levels',
        detailTilted: 'room {room}, notch {notch}, so {share} of the rent',
        detailPlain: '{size} sqm, {share} of the rent',
    },
    locales: { 'es-419': rentSplitEs419, 'pt-br': rentSplitPtBr },
    faqs: [
        {
            question: 'How do you split rent by room size?',
            answer: 'Divide each private room’s area by the total private room area, then multiply by the rent. Keep the sliders at the same level for this method. Shared areas are excluded, so consider whether you want to divide part of the rent equally to account for them.',
        },
        {
            question: 'What does the slider beside each name do?',
            answer: 'The slider multiplies the room’s area by a weight from one to five. Each weighted area is divided by the total to calculate that person’s rent share. If all sliders match, the weights cancel out and rent follows room size alone. If every room size is zero, the calculator starts with equal room shares.',
        },
        {
            question: 'How do you split rent when one flatmate earns more?',
            answer: 'If everyone agrees that the higher earner should contribute more, raise their slider to give their room more weight. The slider does not calculate an income ratio or decide what is fair. Keep all sliders at the same level if you want income to have no effect.',
        },
        {
            question: 'Why does one flatmate pay a fraction more than the others?',
            answer: 'Rounding can leave a small amount unallocated. The calculator rounds each share down, then distributes the remainder to the largest fractions, one smallest currency unit at a time. This keeps the total equal to the rent.',
        },
    ],
    compute: computeRentSplit,
}
