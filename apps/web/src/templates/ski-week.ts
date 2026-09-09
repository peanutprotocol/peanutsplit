import type { RoomTemplate } from './types'

/** Shared accommodation, travel and food costs for a ski trip. */
export const skiWeek: RoomTemplate = {
    slug: 'ski-week',
    updated: '2026-09-09',
    room: { name: 'Ski week', emblem: 'ski' },
    meta: {
        title: 'Split a ski trip: chalet, travel and food',
        description:
            'Share ski trip expenses in one room. Split the chalet, travel and groceries across the group, and assign lift passes and equipment to the people using them.',
    },
    headTerm: 'split a ski trip',
    copy: {
        h1: 'Split a ski trip: chalet, travel and food',
        intro: [
            'Share the chalet, travel and food costs among the people using them. If someone buys lift passes or hires equipment for others, assign those costs to the relevant people.',
            'This template starts a room called Ski week. Add what each person paid, then use the balances to work out repayments.',
        ],
        lines: {
            title: 'Ski trip costs to include',
            intro: 'You do not need to enter something a person bought only for themselves. Add it when somebody else owes them a share.',
            items: [
                'Chalet or apartment booking',
                'Lift passes bought on behalf of others',
                'Equipment hire paid for as a group',
                'Shared groceries',
                'Transfers, car hire, fuel and tolls',
                'Group meals',
            ],
        },
        concession: {
            title: 'Using a shared trip fund',
            body: 'If everyone pays into one fund before the trip, a spreadsheet can track contributions and the remaining money. Split tracks expenses paid by individuals and what they owe each other; it does not hold a shared fund.',
        },
        ctaTitle: 'Create your ski week room',
    },
    faqs: [
        {
            question: 'How do you split a ski trip fairly?',
            answer: 'Agree on accommodation shares and split travel and food among those using them. Keep individual lift passes and equipment costs with their users unless the group agrees otherwise. If people stay for different numbers of nights, agree on their accommodation shares before booking.',
        },
        {
            question: 'What about the person who does not ski?',
            answer: 'Include them in the accommodation, food and travel they share. Leave them out of lift passes and ski equipment they do not use. You can choose different people and shares for each expense.',
        },
        {
            question: 'Can people put things in while they are on the mountain?',
            answer: 'Yes. With the room already available on the device, you can add an expense without a connection. It is queued on the device and sent when the connection returns, with room for up to thirty queued expenses per device. Editing, deleting and recording a repayment need a connection.',
        },
    ],
    related: [
        { href: '/blog/split-a-group-trip-across-countries', label: 'Splitting a trip across countries' },
        { href: '/mileage-split-calculator', label: 'Calculate a shared mileage cost' },
    ],
}
