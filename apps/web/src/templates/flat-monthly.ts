import type { RoomTemplate } from './types'

/** Shared household bills, added as they are paid. */
export const flatMonthly: RoomTemplate = {
    slug: 'flat-monthly',
    updated: '2026-09-09',
    room: { name: 'Flat monthly', emblem: 'house' },
    meta: {
        title: 'Split bills with flatmates, month by month',
        description:
            'Keep rent, utility bills, groceries and other shared household costs in one room. Each flatmate can add expenses and see their balance.',
    },
    headTerm: 'split bills with flatmates',
    copy: {
        h1: 'Split bills with flatmates, month by month',
        intro: [
            'Add each household bill with who paid and the flatmates sharing it. Split combines the expenses and recorded repayments to show each person’s balance.',
            'This template starts a room called Flat monthly. Share the room link with your flatmates and keep adding bills as you pay them.',
        ],
        lines: {
            title: 'Household bills to include',
            intro: 'Add bills manually each time they are paid. Use a description such as “September electricity” to distinguish monthly expenses.',
            items: [
                'Rent, if one flatmate pays the landlord for everyone',
                'Energy, water and council tax',
                'Broadband',
                'Shared groceries',
                'Cleaning supplies and household essentials',
                'Repairs the flatmates are responsible for',
            ],
        },
        concession: {
            title: 'Fixed monthly payments',
            body: 'A standing order may cover a fixed contribution to rent or bills. Split can track variable costs and payments made by different flatmates, but it does not schedule bills or make bank transfers.',
        },
        ctaTitle: 'Create your flat’s room',
    },
    faqs: [
        {
            question: 'How do you split bills with flatmates fairly?',
            answer: 'Agree which costs are shared and which belong to individuals. Equal shares can suit broadband and household supplies. Rent may need a different split if bedrooms differ in size or amenities; account for shared rooms too. Enter the shares the flatmates agree on.',
        },
        {
            question: 'Does the room have to be started again each month?',
            answer: 'No. You can add new bills to the same room after recording repayments. Monthly bills still need to be added manually. A room holds up to 500 expenses.',
        },
        {
            question: 'What happens when somebody moves out?',
            answer: 'Review their balance and agree how to handle bills that arrive after they leave. Once they repay what they owe, record the repayment. Add the new flatmate and select the correct people for future expenses, or start a new room for the new household.',
        },
    ],
    related: [
        { href: '/rent-split-calculator', label: 'Calculate rent shares by room size' },
        { href: '/split-bill-no-signup', label: 'Split bills without an account' },
    ],
}
