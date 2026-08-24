import type { RoomTemplate } from './types'

/**
 * The long stay rather than the holiday: a villa taken by the month, in rupiah, by people who met
 * three weeks ago and will not all leave on the same day.
 */
export const baliVilla: RoomTemplate = {
    slug: 'bali-villa',
    updated: '2026-08-24',
    room: { name: 'Bali villa', currency: 'IDR', emblem: 'island' },
    meta: {
        title: 'Split a villa in Bali, in rupiah',
        description:
            'A room already named and already counting in rupiah, for a villa taken by the month with people you met out there. One link, no signup, nothing to install.',
    },
    headTerm: 'split a villa in bali',
    copy: {
        h1: 'Split a villa in Bali with people you met out there',
        intro: [
            'A villa taken by the month is four or five people who have known each other a few weeks, one landlord who wants the whole thing up front, and a scooter rental nobody can remember the price of. Somebody pays in cash on a Tuesday and it leaves no trace at all.',
            'This link opens a room called Bali villa, counting in rupiah, so a figure typed in the kitchen is the figure everybody sees. Add the villa first, then the driver, the laundry and the water, and whoever leaves early leaves with a number rather than an argument.',
        ],
        lines: {
            title: 'What usually goes in a Bali villa',
            intro: 'The month has more moving parts than a week does. These are the ones that get forgotten.',
            items: [
                'The month on the villa, under whoever transferred it',
                'The deposit, kept separate so it can come back out',
                'Scooters, one line per bike',
                'The driver for the airport run',
                'Laundry, the water delivery and the cleaner',
                'The big Pepito shop, whoever happened to be in the car',
            ],
        },
        concession: {
            title: 'When a shared note is the better tool',
            body: 'Two people splitting one villa fifty-fifty for a month have one number to remember and a note on a phone holds it fine. This is for the house of five where the driver was cash, the villa was a transfer, and the person who leaves on the 14th needs to know what they owe before the taxi comes.',
        },
        ctaTitle: 'Open the villa room while everyone is still in it',
    },
    faqs: [
        {
            question: 'How do you split a villa in Bali with strangers?',
            answer: 'Open the room the day the villa is agreed and put the rent in before anybody moves anything else. People who have known each other three weeks have no shared history to fall back on, so the ledger has to be visible from the first payment rather than reconstructed from a group chat in week four.',
        },
        {
            question: 'Does it handle rupiah and euros in the same room?',
            answer: 'Yes. The room counts in rupiah and an expense paid in another currency is converted at the day’s indicative rate, which is the rate a reference table gives rather than the one a bank charged. Where the two differ, the person who paid can type the rate they actually got.',
        },
        {
            question: 'What about the person who leaves two weeks early?',
            answer: 'Settle them out on the day they go. Their share of the villa is theirs whether they sleep in it or not unless the house agrees otherwise, and the room records the payment when it is made, so nobody is chasing a transfer from a different time zone.',
        },
    ],
    related: [
        { href: '/t/villa-week', label: 'The same room for a week rather than a month' },
        { href: '/blog/split-expenses-across-currencies', label: 'Splitting money in a currency you do not bank in' },
    ],
}
