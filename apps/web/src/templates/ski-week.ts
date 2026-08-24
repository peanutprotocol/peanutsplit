import type { RoomTemplate } from './types'

/**
 * The chalet week, whose defining argument is the pass somebody bought in October.
 */
export const skiWeek: RoomTemplate = {
    slug: 'ski-week',
    updated: '2026-08-24',
    room: { name: 'Ski week', emblem: 'ski' },
    meta: {
        title: 'Split a ski trip: chalet, passes, the shop',
        description:
            'A room for the week: the chalet on one card, the passes bought at four different times, the shop on the way up. One link, and no reckoning on the drive home.',
    },
    headTerm: 'split a ski trip',
    copy: {
        h1: 'Split a ski trip when nobody paid for the same thing',
        intro: [
            'The chalet went on one card in September. Two people bought passes in the autumn sale, one bought a day pass on the Tuesday because their knee went, and somebody did a shop at the supermarket in the valley for eight people.',
            'This link opens a room called Ski week. Everything goes in under whoever paid it, the week nets down at the end, and the drive home is not the conversation where somebody works out what the diesel came to.',
        ],
        lines: {
            title: 'What usually goes in a ski week',
            intro: 'The lift pass is the line that causes the argument. Decide before the trip whether a season pass bought months ago is in or out.',
            items: [
                'The chalet or the apartment, under the card it went on',
                'Lift passes, one line per person who bought their own',
                'Hire kit, which is rarely the same price for everybody',
                'The supermarket shop in the valley',
                'Fuel, tolls and the winter tyres',
                'The one dinner up the mountain that costs more than the shop did',
            ],
        },
        concession: {
            title: 'When a spreadsheet is the better tool',
            body: 'A group that pre-pays a fixed amount each into one kitty and spends out of it has a simpler problem, and a spreadsheet closes it in one line. A room is better when the paying is spread across six people and eight days and nobody knows the total until Thursday.',
        },
        ctaTitle: 'Open the room before the passes get bought',
    },
    faqs: [
        {
            question: 'How do you split a ski trip fairly?',
            answer: 'Split the shared costs — the chalet, the food, the fuel — across everybody, and keep each person’s own kit and passes to themselves. The one to agree in advance is the season pass: it was bought before the trip existed, so putting it into the group total charges the others for a decision they were not part of.',
        },
        {
            question: 'What about the person who does not ski?',
            answer: 'They pay for the bed and the food and not for the mountain. That is only awkward if it is raised on the last day, which is the argument for opening the room before anybody has booked anything.',
        },
        {
            question: 'Can people put things in while they are on the mountain?',
            answer: 'Yes, and a line typed with no signal is kept on the phone and sent when the signal comes back. Recording a settle-up needs a connection, so that part waits until the bar.',
        },
    ],
    related: [
        { href: '/blog/split-a-group-trip-across-countries', label: 'A trip that crosses a border and a currency' },
        { href: '/mileage-split-calculator', label: 'Costing the drive at an official rate' },
    ],
}
