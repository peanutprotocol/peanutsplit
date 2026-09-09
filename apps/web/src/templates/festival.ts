import type { RoomTemplate } from './types'

/** Festival tickets and shared travel, camping and food costs. */
export const festival: RoomTemplate = {
    slug: 'festival',
    updated: '2026-09-09',
    room: { name: 'Festival', emblem: 'tent' },
    meta: {
        title: 'Split festival costs with the whole camp',
        description:
            'Track festival tickets, transport, camping supplies and food in one shared room. Record who paid and what each person owes, without creating an account.',
    },
    headTerm: 'split festival costs',
    copy: {
        h1: 'Split festival costs when one person bought the tickets',
        intro: [
            'Add the ticket purchase with the booking fee, who paid and which tickets belong to each person. Record repayments as they happen so the group can see what is still owed.',
            'This template starts a room called Festival. Use it for tickets bought in advance and for the costs you share during the weekend.',
        ],
        lines: {
            title: 'Festival costs to include',
            intro: 'Select the people sharing each expense. Different ticket types or travel plans may need different shares.',
            items: [
                'Tickets and booking fees',
                'Coach tickets or van hire and fuel',
                'Shared camping equipment',
                'Groceries for the group',
                'Ice and other campsite supplies',
                'Taxis and return travel',
            ],
        },
        concession: {
            title: 'For a single ticket purchase',
            body: 'If you bought one ticket for one friend, sending them the amount and your payment details may be enough. A shared room is useful when several people pay for tickets, transport and supplies, or repay in instalments.',
        },
        ctaTitle: 'Create your festival room',
    },
    faqs: [
        {
            question: 'How do I track tickets bought months before the festival?',
            answer: 'Add the purchase when you buy the tickets and agree on when each person will repay you. Record any repayments already received, including partial ones. Split shows the remaining balances; it does not collect the money.',
        },
        {
            question: 'What about the booking fee?',
            answer: 'Include the booking fee in the ticket expense. If every ticket cost the same, split the total equally. If prices or fees differ, enter each person’s actual share.',
        },
        {
            question: 'Someone dropped out and sold their ticket on. Now what?',
            answer: 'Keep the original buyer recorded as the person who paid for the tickets. Agree who receives the resale money and who covers any shortfall. Record only repayments that actually happened between room members. If the replacement pays the departing person outside the room, do not record that as a repayment to the original buyer.',
        },
    ],
    related: [
        { href: '/blog/fronting-a-group-trip', label: 'Paying upfront for a group' },
        { href: '/split-bill-no-signup', label: 'Split bills without an account' },
    ],
}
