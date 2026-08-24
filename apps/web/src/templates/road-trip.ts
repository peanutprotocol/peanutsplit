import type { RoomTemplate } from './types'

/**
 * One car, several drivers, and a fuel card that belongs to whoever happened to stop.
 */
export const roadTrip: RoomTemplate = {
    slug: 'road-trip',
    updated: '2026-08-24',
    room: { name: 'Road trip', emblem: 'van' },
    meta: {
        title: 'Split a road trip: fuel, tolls, the car',
        description:
            'A room for the car and everything it costs. Fuel goes in at the pump under whoever tapped, tolls as they come, and the trip nets down when you get there.',
    },
    headTerm: 'split a road trip',
    copy: {
        h1: 'Split a road trip without keeping the fuel receipts',
        intro: [
            'Four people, one car, and a tank that gets filled by whoever is driving when the light comes on. By the third day nobody knows who has paid for more of it, and the person whose car it is has also paid for the tyre.',
            'This link opens a room called Road trip. Fuel goes in at the pump while the receipt is still in your hand, tolls go in as they happen, and the trip has a running total instead of a pile of paper in the door pocket.',
        ],
        lines: {
            title: 'What usually goes in a road trip',
            intro: 'Put the car itself in first, whether it was hired or lent, so the fuel is not the only thing anybody is paying for.',
            items: [
                'The hire, or an agreed figure for using somebody’s own car',
                'Fuel, a line per fill, under whoever tapped',
                'Tolls and the city congestion charges',
                'Parking, which adds up faster than anybody expects',
                'The night in the middle nobody planned for',
                'Food from the services, split or not, as the car prefers',
            ],
        },
        concession: {
            title: 'When cash still wins',
            body: 'Two friends alternating fills for a weekend do not need a ledger; they need a rough memory and some goodwill. A room starts paying for itself at four people, or at the point where one person’s card is doing all the tapping and the others have lost count of how much.',
        },
        ctaTitle: 'Open the room before the first fill',
    },
    faqs: [
        {
            question: 'How do you split fuel on a road trip?',
            answer: 'Put each fill in as it happens, under the person who paid, and divide it across whoever is in the car. It comes out the same as taking turns and it survives the day somebody joins halfway, which taking turns does not.',
        },
        {
            question: 'What do you charge for using somebody’s own car?',
            answer: 'Most groups agree a rate per kilometre and put one line in for the whole trip. Several countries publish an official rate for exactly this, which is a defensible number to borrow rather than a figure somebody in the car invented.',
        },
        {
            question: 'Can it work with no signal in the mountains?',
            answer: 'Adding an expense with no connection is kept on the phone and goes in when the signal comes back, so a fill at a petrol station in the middle of nowhere is not lost. Settling up needs a connection.',
        },
    ],
    related: [
        { href: '/mileage-split-calculator', label: 'What a shared drive actually costs' },
        { href: '/blog/split-expenses-offline', label: 'Adding an expense with no signal' },
    ],
}
