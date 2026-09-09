import type { RoomTemplate } from './types'

/** A shared villa stay with balances in Indonesian rupiah. */
export const baliVilla: RoomTemplate = {
    slug: 'bali-villa',
    updated: '2026-09-09',
    room: { name: 'Bali villa', currency: 'IDR', emblem: 'island' },
    meta: {
        title: 'Split a villa in Bali, in rupiah',
        description:
            'Track rent, transport and household expenses for a shared villa in Bali. This template starts a room in Indonesian rupiah, with no account needed.',
    },
    headTerm: 'split a villa in bali',
    copy: {
        h1: 'Split a villa in Bali, in rupiah',
        intro: [
            'Record the villa rent and shared expenses with who paid and each person’s share. Split shows the group’s balances in Indonesian rupiah.',
            'This template fills in the room name Bali villa and the currency IDR. Add your name, create the room and share its link with the people staying there.',
        ],
        lines: {
            title: 'Shared villa expenses',
            intro: 'Include the costs the group has agreed to share. For a scooter or airport transfer, select only the people using it.',
            items: [
                'Villa rent',
                'Electricity and water bills',
                'Shared scooter rental',
                'Airport transfers',
                'Laundry, drinking water and cleaning',
                'Shared groceries',
            ],
        },
        concession: {
            title: 'Agree on dates and rent first',
            body: 'Decide how to split the rent before booking, including what happens if someone leaves early. Split records the shares you enter; it does not calculate rent from arrival and departure dates.',
        },
        ctaTitle: 'Create your Bali villa room',
    },
    faqs: [
        {
            question: 'How should we split rent for a shared villa?',
            answer: 'Agree on each person’s share before paying the landlord. An equal split may suit similar rooms and matching stays. If rooms or dates differ, enter the amounts you have agreed for each person. Keep a written agreement about cancellations and refundable deposits.',
        },
        {
            question: 'Does it handle rupiah and euros in the same room?',
            answer: 'Yes. Euro expenses are converted to rupiah at the day’s indicative rate, fixed when the expense is added. This may differ from the rate your bank charged, and you cannot override the rate for these currencies. If you know the actual rupiah amount you want to share, enter that amount in rupiah.',
        },
        {
            question: 'What about the person who leaves two weeks early?',
            answer: 'Use the rent arrangement the group agreed, or agree on a change before adjusting the expense. Include their share of bills incurred before they left. They can repay their balance by bank transfer or cash, then record the repayment in Split.',
        },
    ],
    related: [
        { href: '/t/villa-week', label: 'Template for a villa holiday' },
        { href: '/blog/split-expenses-across-currencies', label: 'Sharing expenses in different currencies' },
    ],
}
