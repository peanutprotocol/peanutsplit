import { allocateByWeights, formatFigure, formatShareOfWhole } from './allocate'
import type { Tool, ToolInput, ToolOutcome, ToolWorking } from './types'

/**
 * Rent by room size, with income weighting as a second method rather than a correction to the
 * first.
 *
 * §3.10 puts rent and utilities in the flat register: this reader wants an arbiter, the page gets
 * quoted at a flatmate, and personality reads as a thumb on the scale. So there is no wink, no
 * litotes and no joke anywhere in this file, and the copy gate checks the register the tool
 * declares.
 *
 * The weighting is deliberately one blend and not a slider of them: half the rent follows floor
 * area, half follows income. A slider would be a page inviting a household to negotiate the
 * negotiation, and §8.4 is that we present a method and decline to hold an opinion about it.
 */

const EQUAL = (count: number) => 1 / count

function computeRentSplit({ values, toggles, rows }: ToolInput): ToolOutcome {
    const rent = Math.trunc(values.rent ?? 0)
    const empty: ToolOutcome = { shares: [], totalMinor: 0, workings: [] }

    if (rows.length === 0) return { ...empty, problem: 'Say how many people are on the rent.' }
    if (rent < 0) return { ...empty, problem: 'Rent cannot be less than nothing.' }
    if (!Number.isSafeInteger(rent)) return { ...empty, problem: 'That is a bigger rent than this page divides.' }

    const byIncome = toggles.byIncome === true
    const sizes = rows.map((row) => Math.max(0, row.values.size ?? 0))
    const incomes = rows.map((row) => Math.max(0, row.values.income ?? 0))
    const floorArea = sizes.reduce((running, size) => running + size, 0)
    const incomeTotal = incomes.reduce((running, income) => running + income, 0)

    // An unmeasured flat is asking for the equal answer, not for an error — same for a household
    // that turned income weighting on before typing any incomes in.
    const roomShares = sizes.map((size) => (floorArea > 0 ? size / floorArea : EQUAL(rows.length)))
    const incomeShares = incomes.map((income) => (incomeTotal > 0 ? income / incomeTotal : EQUAL(rows.length)))
    const weights = roomShares.map((room, index) => (byIncome ? (room + incomeShares[index]) / 2 : room))

    const amounts = allocateByWeights(rent, weights)
    const workings: ToolWorking[] = [
        { label: 'Rent', amountMinor: rent },
        { label: 'Floor area measured', value: `${formatFigure(floorArea)} sqm` },
    ]
    if (byIncome) workings.push({ label: 'Income counted', amountMinor: incomeTotal })

    return {
        shares: rows.map((row, index) => ({
            label: row.name,
            amountMinor: amounts[index],
            detail: byIncome
                ? `room ${formatShareOfWhole(roomShares[index], 1)}, income ${formatShareOfWhole(incomeShares[index], 1)}, so ${formatShareOfWhole(weights[index], 1)} of the rent`
                : `${formatFigure(sizes[index])} sqm, ${formatShareOfWhole(roomShares[index], 1)} of the rent`,
        })),
        totalMinor: rent,
        workings,
    }
}

export const rentSplitCalculator: Tool = {
    slug: 'rent-split-calculator',
    updated: '2026-07-30',
    register: 'flat',
    meta: {
        title: 'Rent split calculator by room size',
        description:
            'Split rent between flatmates in proportion to room size, with income weighting as an option. The amounts reconcile to the cent.',
    },
    copy: {
        h1: 'Rent split calculator by room size',
        intro: [
            'Enter the rent and the size of each private room. The rent is divided in proportion to that floor area, and the amounts move as you type.',
            'Income weighting is a second method rather than a correction to the first. Turned on, half the rent follows room size and half follows income. Split by Peanut holds the same arithmetic in a page the whole flat can open.',
        ],
        formTitle: 'The flat',
        resultTitle: 'What each room pays',
        resultHint: 'Enter the rent and how many people are on it.',
        roundingNote:
            'Rent rarely divides evenly, so whatever is left at the end goes to the largest fractions first, one unit each. The column adds up to the rent exactly.',
        copyLabel: 'Copy the split',
        copyDone: 'Copied',
        method: {
            title: 'Where this stops being worth it',
            body: [
                'So is everyone going to split how many times they use the loo, or who left the lights on, or the hours one person spends in the kitchen? No. A bigger bedroom is one decision, made once, and it stays true all year. The loo roll is a running argument.',
                'Most households land on splitting what one person clearly consumes and leaving the shared things shared. Where the gap between the two biggest rooms works out at a few pounds a month, the upheaval costs more than the money does.',
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
        {
            name: 'byIncome',
            kind: 'toggle',
            label: 'Weight it by income',
            help: 'Half the rent follows room size, half follows income.',
            defaultValue: 0,
        },
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
                name: 'income',
                kind: 'amount',
                label: 'Monthly income',
                help: 'Take-home, after tax.',
                requiresToggle: 'byIncome',
                defaultValue: 0,
                min: 0,
            },
        ],
    },
    faqs: [
        {
            question: 'How do you split rent by room size?',
            answer: 'Measure the private rooms, add the floor area up, and give each person the same proportion of the rent as their room is of that total. Shared space stays out of the sum, because everybody has the same claim on it.',
        },
        {
            question: 'How do you split rent when one flatmate earns more?',
            answer: 'Weight it, or do not. With income weighting on, half the rent follows room size and half follows income, so the number moves toward what each person can pay without ignoring what each person gets. It is a method rather than a verdict, and a household that would rather split on room size alone should leave it off.',
        },
        {
            question: 'Why does one flatmate pay a fraction more than the others?',
            answer: 'Rent rarely divides evenly. The page rounds every share down first, then hands whatever is left over to the largest fractions, one unit each, so the column adds up to the rent rather than to a hair under it.',
        },
    ],
    compute: computeRentSplit,
}
