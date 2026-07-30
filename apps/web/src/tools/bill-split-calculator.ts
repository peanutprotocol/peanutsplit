import { allocateByWeights, formatFigure, percentageOfMinor } from './allocate'
import type { Tool, ToolInput, ToolOutcome, ToolWorking } from './types'

/**
 * The head term. "Bill split calculator" is what somebody types standing outside a restaurant, so
 * the page has to answer before it explains: one total, one number of people, a result that is
 * already on screen when the page loads.
 *
 * Uneven shares are the only complication it takes. A share of one is even, a half is the person
 * who skipped the drinks, two is the person who ordered for the table — which covers the two
 * adjustments people actually ask for without asking them to itemise a receipt. Itemising is what
 * a room is for.
 */

function computeBillSplit({ values, rows }: ToolInput): ToolOutcome {
    const bill = Math.trunc(values.bill ?? 0)
    const empty: ToolOutcome = { shares: [], totalMinor: 0, workings: [] }

    if (rows.length === 0) return { ...empty, problem: 'Say how many people are paying.' }
    if (bill < 0) return { ...empty, problem: 'A bill cannot be less than nothing.' }
    // Past this the doubles stop counting whole cents, and a wrong number is worse than no number.
    if (!Number.isSafeInteger(bill)) return { ...empty, problem: 'That is a bigger total than this page divides.' }

    const tipPercent = Math.max(0, values.tip ?? 0)
    const tip = percentageOfMinor(bill, tipPercent)
    const total = bill + tip

    const weights = rows.map((row) => Math.max(0, row.values.share ?? 0))
    const shareCount = weights.reduce((running, weight) => running + weight, 0)
    if (shareCount <= 0) return { ...empty, problem: 'Every share is set to nothing, so there is nothing to divide.' }

    const amounts = allocateByWeights(total, weights)
    const workings: ToolWorking[] = [{ label: 'Bill', amountMinor: bill }]
    if (tip !== 0) {
        workings.push({ label: 'Tip', amountMinor: tip })
        workings.push({ label: 'Total to divide', amountMinor: total })
    }
    workings.push({ label: 'Shares', value: formatFigure(shareCount) })

    return {
        shares: rows.map((row, index) => ({
            label: row.name,
            amountMinor: amounts[index],
            detail: `${formatFigure(weights[index])} of ${formatFigure(shareCount)} shares`,
        })),
        totalMinor: total,
        workings,
    }
}

export const billSplitCalculator: Tool = {
    slug: 'bill-split-calculator',
    updated: '2026-07-30',
    register: 'default',
    meta: {
        title: 'Bill split calculator with tip',
        description:
            'Split a bill between friends, with a tip and with shares that are not equal. The per-person amounts reconcile to the cent.',
    },
    copy: {
        h1: 'Bill split calculator',
        intro: [
            'Type the total, say how many people are paying, and the amounts below move as you type. Somebody who skipped the drinks takes a smaller share, somebody who ordered for the table takes a bigger one.',
            'The arithmetic was never the hard part. What comes after it is: four people have to be asked for money, and most people put that off for a week. Let Split by Peanut do that bit instead — one link in the group chat, everyone adds what they paid, and the room nets it down to two or three transfers instead of twenty.',
        ],
        formTitle: 'The bill',
        resultTitle: 'Who pays what',
        resultHint: 'Enter a total and how many people are paying.',
        roundingNote:
            'A total rarely divides evenly, so whatever is left at the end goes to the largest fractions first, one unit each. The column adds up to the exact total.',
        copyLabel: 'Copy the amounts',
        copyDone: 'Copied',
        concession: {
            title: 'When cash is the better tool',
            body: 'Four people at one table, a round each, notes on the counter: that is settled before a page like this finishes loading. The arithmetic earns its keep when the paying is spread over days and people, and nobody can remember who covered the taxi.',
        },
        goodToKnow: {
            title: 'Good to know',
            body: [
                'Split is free forever, with nothing to upgrade to.',
                'Twelve currencies, converted at the day’s rate. The rate is indicative rather than your bank’s.',
                'A room holds up to twenty people.',
                'Split records a payment rather than making one: two people settle however they settle, and one of them taps to record it.',
            ],
        },
        cta: {
            title: 'Turn this into a room',
            body: 'Takes ten seconds. No email, no password, no download.',
            label: 'Start a split',
        },
        faqTitle: 'Questions',
    },
    fields: [
        { name: 'bill', kind: 'amount', label: 'Total on the bill', defaultValue: 60, min: 0 },
        { name: 'people', kind: 'count', label: 'People paying', help: 'Up to twenty.', defaultValue: 4, min: 1, max: 20 }, // prettier-ignore
        {
            name: 'tip',
            kind: 'percent',
            label: 'Tip',
            unit: '%',
            help: 'Leave it at nothing when the tip is already on the bill.',
            defaultValue: 0,
            min: 0,
            max: 100,
            step: 1,
        },
    ],
    rows: {
        countField: 'people',
        nameLabel: 'Name',
        namePrefix: 'Person',
        columns: [
            {
                name: 'share',
                kind: 'number',
                label: 'Share',
                help: 'One is an even share. A half for somebody who skipped the drinks, two for somebody who ordered for two.',
                defaultValue: 1,
                min: 0,
                step: 0.5,
            },
        ],
    },
    related: [
        { href: '/split-bill-no-signup', label: 'Split a bill with no sign-up and no app' },
        { href: '/blog/who-pays-for-the-wine', label: 'Who pays for the wine' },
        { href: '/blog/split-bills-without-an-app', label: 'How to split bills without an app' },
    ],
    faqs: [
        {
            question: 'How do you split a bill with a tip?',
            answer: 'Add the tip to the bill first, then divide what that comes to. This page works in that order: the percentage applies to the whole bill, and the sum of the two is what gets shared out.',
        },
        {
            question: 'How do you split a bill when one person did not drink?',
            answer: 'Give that person a smaller share rather than a smaller number. A half, or nothing at all for the round they sat out, and the rest of the table picks the difference up in proportion to what they took.',
        },
        {
            question: 'Why do the amounts not divide evenly?',
            answer: 'Because money does not divide into thirds. The total is divided first, and whatever is left over is handed out one unit each, largest fraction first, so the column still adds up to what is on the bill.',
        },
    ],
    compute: computeBillSplit,
}
