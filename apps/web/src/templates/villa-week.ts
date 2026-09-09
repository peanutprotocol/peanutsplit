import type { RoomTemplate } from './types'

/** A shared villa booking and holiday expenses. */
export const villaWeek: RoomTemplate = {
    slug: 'villa-week',
    updated: '2026-09-09',
    room: { name: 'Villa week', emblem: 'island' },
    meta: {
        title: 'Split a villa booking and holiday expenses',
        description:
            'Track a shared villa booking, groceries, car hire and meals in one room. Choose equal or custom shares and see what each person owes.',
    },
    headTerm: 'split a villa',
    copy: {
        h1: 'Split a villa booking and holiday expenses',
        intro: [
            'Record the villa booking with who paid and each guest’s agreed share. Add the other shared holiday expenses as you pay them, and Split calculates the group’s balances.',
            'This template starts an empty room called Villa week. Add your name, create the room and send its link to the group.',
        ],
        lines: {
            title: 'Villa holiday costs to include',
            intro: 'Record the amount actually paid for each expense. If a booking is paid in instalments, enter each payment once and avoid also adding the full booking total.',
            items: [
                'Villa booking payments',
                'Cleaning and service fees charged separately',
                'Shared groceries',
                'Car hire and fuel',
                'Group meals',
                'Airport transfers',
            ],
        },
        concession: {
            title: 'For one shared booking',
            body: 'If the booking is your only shared cost, you can divide it and send each person the amount they owe. A room is useful when different people also pay for food, transport and activities throughout the stay.',
        },
        ctaTitle: 'Create your villa week room',
    },
    faqs: [
        {
            question: 'How do you split a villa between friends?',
            answer: 'An equal split can work when everyone stays for the same dates in similar rooms. Otherwise, agree on each person’s amount before booking and enter those shares. Record the other shared costs separately so they can be split among the people using them.',
        },
        {
            question: 'What if one couple gets the room with the balcony?',
            answer: 'Agree whether the better room should cost more before assigning bedrooms. Enter the agreed accommodation amounts as custom shares. A couple’s combined amount can be divided between their two names. Food and transport can use a different split.',
        },
        {
            question: 'Does everybody need to install something?',
            answer: 'No. Split opens in a browser and does not require an account. Each person opens the room link and adds or selects their name. Keep the link somewhere the group can find it; there is no account recovery if everyone loses it.',
        },
    ],
    related: [
        { href: '/split-airbnb-cost-unequal-rooms', label: 'Splitting a booking with unequal rooms' },
        { href: '/blog/fronting-a-group-trip', label: 'Paying upfront for a group trip' },
    ],
}
