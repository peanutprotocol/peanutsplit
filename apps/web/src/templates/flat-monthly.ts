import type { RoomTemplate } from './types'

/**
 * The household that keeps going: same four people, same six bills, a new month every month.
 */
export const flatMonthly: RoomTemplate = {
    slug: 'flat-monthly',
    updated: '2026-08-24',
    room: { name: 'Flat monthly', emblem: 'house' },
    meta: {
        title: 'Split bills with flatmates, month by month',
        description:
            'A room for the household ledger: rent, the energy bill, the broadband, the shop nobody logged. One link the flat keeps, and nobody having to do the chasing.',
    },
    headTerm: 'split bills with flatmates',
    copy: {
        h1: 'Split bills with flatmates without doing the chasing',
        intro: [
            'One person’s name is on the energy account, another’s is on the broadband, and a third does the big shop because they have the car. Every month each of them is owed something by everybody else, and every month one of them has to be the one who mentions it.',
            'This link opens a room called Flat monthly. It stays open — the same room in March that it was in January — so the bills land in it as they arrive and the flat can see where it stands without anybody sending a message that starts with sorry.',
        ],
        lines: {
            title: 'What usually goes in a flat’s room',
            intro: 'Put the recurring ones in as they are paid rather than at the end of the month, while the amount is still on the screen in front of you.',
            items: [
                'Rent, if it goes through one person rather than to the landlord separately',
                'Energy, water and council tax',
                'Broadband, under whoever the account belongs to',
                'The weekly shop, one line each time',
                'Cleaning things, bin bags, the light bulbs nobody wants to pay for',
                'The washing machine repair, when it comes',
            ],
        },
        concession: {
            title: 'When a standing order is the better tool',
            body: 'A flat that has agreed a flat rate and pays it into one account on the first of the month has already solved this, and should carry on. A room is for the half of the household budget that changes: the bill that doubled in January, the shop that was somebody’s turn, the repair split four ways.',
        },
        ctaTitle: 'Open the flat’s room and let the bills land in it',
    },
    faqs: [
        {
            question: 'How do you split bills with flatmates fairly?',
            answer: 'Split what the household uses evenly and the private things by who has them. Rent can follow room size where the rooms are obviously different; energy, water and broadband are used by the kitchen and the hallway as much as by anybody’s bedroom, so an even split is usually the one nobody argues with.',
        },
        {
            question: 'Does the room have to be started again each month?',
            answer: 'No. It is one room that keeps running. Settling up marks what has been paid so far, and the next bill goes in underneath it, so the flat has a history without anybody maintaining a spreadsheet.',
        },
        {
            question: 'What happens when somebody moves out?',
            answer: 'Settle their balance on the day they leave, then keep the room. Their old lines stay in it as a record of what the flat has cost, and the person moving in adds their own name when they arrive.',
        },
    ],
    related: [
        { href: '/rent-split-calculator', label: 'Rent by room size, with the working shown' },
        { href: '/split-bill-no-signup', label: 'Splitting a bill with nobody making an account' },
    ],
}
