import { allocateByWeights, formatFigure, formatShareOfWhole, MAX_SAFE_MINOR } from './allocate'
import type { Tool, ToolInput, ToolOutcome, ToolWorking } from './types'

/**
 * Rent by room size, with a slider per person as the second half of the method.
 *
 * **The slider replaced a box asking for a monthly income.** Nobody types their real pay into a
 * marketing page, and the ones who would have to look it up first — so the honest instrument is
 * five labelled notches the whole flat can argue about out loud. It is not a proxy for a salary and
 * does not pretend to be one; it is a relative weight, and the FAQ says exactly what the notch does.
 *
 * **Leave every slider alone and it does nothing.** A flat where all five notches match is a flat
 * that has told us nothing, so the rent follows floor area and only floor area. Move one and half
 * the rent starts following the sliders. That rule is what lets the control stay visible without
 * silently tilting a result nobody asked it to tilt — there is no hidden toggle behind it.
 *
 * Register is the house default (§3.10 relaxed on 30 Jul), but §8.1 still holds: money between
 * flatmates gets the fairness boundary in full, carried lightly rather than solemnly.
 */

const EQUAL = (count: number) => 1 / count

/** Five notches, and the notch is the weight. Off the scale in either direction is not a notch. */
const TOP_NOTCH = 5
const notchOf = (value: number): number => Math.min(TOP_NOTCH, Math.max(1, Math.round(value) || 1))

function computeRentSplit({ values, rows }: ToolInput): ToolOutcome {
    const rent = Math.trunc(values.rent ?? 0)
    const empty: ToolOutcome = { shares: [], totalMinor: 0, workings: [] }

    if (rows.length === 0) return { ...empty, problem: 'Say how many people are on the rent.' }
    if (rent < 0) return { ...empty, problem: 'Rent cannot be less than nothing.' }
    if (!Number.isSafeInteger(rent) || rent > MAX_SAFE_MINOR)
        return { ...empty, problem: 'That is a bigger rent than this page divides.' }

    const sizes = rows.map((row) => Math.max(0, row.values.size ?? 0))
    const notches = rows.map((row) => notchOf(row.values.rich ?? 1))
    const floorArea = sizes.reduce((running, size) => running + size, 0)
    const notchTotal = notches.reduce((running, notch) => running + notch, 0)

    // A flat that has not moved a slider has said nothing about who is flush, and a page that
    // acted on nothing would be inventing an opinion. Same for an unmeasured flat: no floor area
    // is a request for the equal answer rather than an error.
    const tilted = notches.some((notch) => notch !== notches[0])
    const roomShares = sizes.map((size) => (floorArea > 0 ? size / floorArea : EQUAL(rows.length)))
    const richShares = notches.map((notch) => notch / notchTotal)
    const weights = roomShares.map((room, index) => (tilted ? (room + richShares[index]) / 2 : room))

    const amounts = allocateByWeights(rent, weights)
    const workings: ToolWorking[] = [
        { label: 'Rent', amountMinor: rent },
        { label: 'Floor area measured', value: `${formatFigure(floorArea)} sqm` },
    ]
    if (tilted) workings.push({ label: 'Where the sliders sit', value: notches.join(', ') })

    return {
        shares: rows.map((row, index) => ({
            label: row.name,
            amountMinor: amounts[index],
            detail: tilted
                ? `room ${formatShareOfWhole(roomShares[index], 1)}, slider ${formatShareOfWhole(richShares[index], 1)}, so ${formatShareOfWhole(weights[index], 1)} of the rent`
                : `${formatFigure(sizes[index])} sqm, ${formatShareOfWhole(roomShares[index], 1)} of the rent`,
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
            'Split rent between flatmates in proportion to room size, with a slider for who is better off. The amounts reconcile to the cent.',
    },
    copy: {
        h1: 'Rent split calculator by room size',
        intro: [
            'Put in the rent and the size of each private room. The rent follows that floor area, and the numbers move while you type.',
            'The slider beside each name is the other half of the argument. Leave them all where they are and nothing happens; move one and half the rent starts following who is flush instead. Split by Peanut holds the same arithmetic in a page the whole flat can open.',
        ],
        resultTitle: 'What each room pays',
        resultHint: 'Put in the rent and how many people are on it.',
        roundingNote:
            'Rent rarely divides evenly, so whatever is left at the end goes to the largest fractions first, one unit each. The column adds up to the rent exactly.',
        copyLabel: 'Copy the split',
        copyDone: 'Copied',
        method: {
            title: 'Where the measuring stops',
            body: [
                'Somebody in the flat will ask where this ends — the kitchen next, then the hot water, then who is home enough to use either. The line here is drawn at what gets measured once. A bedroom is the same size in November as it was in March, so the rent it carries can be settled in one conversation; a kettle would need a new one every week.',
                'The size of the gap decides whether to have that conversation at all. If the biggest room and the smallest come out within small change of each other, a flat gets more from leaving the rent alone than from reopening it every month.',
            ],
        },
        concession: {
            title: 'When a spreadsheet is the better tool',
            body: 'A household that agreed this a year ago and pays by standing order does not need a page for it. A spreadsheet holds an agreement fine once the argument is over. This is for the part before that, where the number is still being decided and somebody has to show the working.',
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
            title: 'Put the numbers where the flat can see them',
            body: 'Takes ten seconds. No email, no password, no download.',
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
        { href: '/tools', label: 'The other calculator' },
    ],
    faqs: [
        {
            question: 'How do you split rent by room size?',
            answer: 'Measure the private rooms, add the floor area up, and give each person the same proportion of the rent as their room is of that total. Shared space stays out of the sum, because everybody has the same claim on it.',
        },
        {
            question: 'What does the slider beside each name actually do?',
            answer: 'It is five notches, and the notch is the weight: notch one counts once, notch five counts five times, and the notches are added up across the flat to give everybody a share of half the rent. The other half stays with the floor area. While every slider reads the same the whole thing is switched off and the rent follows room size alone, so a flat that would rather not have this conversation can leave the sliders level and lose nothing.',
        },
        {
            question: 'How do you split rent when one flatmate earns more?',
            answer: 'Move their slider up, or do not. With the sliders apart, half the rent follows room size and half follows where the flat put everybody, so the number moves toward what each person can pay without ignoring what each person gets. It is a method rather than a verdict, and a household that would rather split on room size alone should leave the sliders level.',
        },
        {
            question: 'Why does one flatmate pay a fraction more than the others?',
            answer: 'Rent rarely divides evenly. The page rounds every share down first, then hands whatever is left over to the largest fractions, one unit each, so the column adds up to the rent rather than to a hair under it.',
        },
    ],
    compute: computeRentSplit,
}
