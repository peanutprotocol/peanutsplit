import type { RoomTemplate } from './types'

/**
 * The holiday let a group books together: one card takes the deposit in February and the money is
 * not mentioned again until August.
 */
export const villaWeek: RoomTemplate = {
    slug: 'villa-week',
    updated: '2026-08-24',
    room: { name: 'Villa week', emblem: 'island' },
    meta: {
        title: 'Split a villa with the people in it',
        description:
            'A room already named for the week, ready for the booking and everything after it. Tap the link, add your name, and the group can see the total as it grows.',
    },
    headTerm: 'split a villa',
    copy: {
        h1: 'Split a villa without keeping the receipts',
        intro: [
            'The booking goes on one card in February. By the time anybody is packing there is a deposit, a car, a food shop and no agreement about any of it, and the person who paid is the one who has to bring it up.',
            'This link opens a room called Villa week with nothing in it yet. Send it to the group, everybody adds what they paid as they pay it, and the week has a running total from the deposit onward instead of a reckoning on the last night.',
        ],
        lines: {
            title: 'What usually goes in a villa week',
            intro: 'Six lines cover most of one. Put the booking in first, under whoever the card actually belonged to.',
            items: [
                'The booking, on the card it went on',
                'Cleaning and service fees, if they were charged apart from the nightly rate',
                'The big food shop on day one',
                'The hire car, and the fuel it went home on',
                'Dinners out, one line each',
                'The taxi back to the airport',
            ],
        },
        concession: {
            title: 'When the group chat still wins',
            body: 'Two people sharing a flat for a long weekend can settle it in a message and be right. A room earns its keep once three or more people are paying for different things on different days, because that is the point where nobody can hold the running total in their head any more.',
        },
        ctaTitle: 'Open the room before the deposit, not after the last night',
    },
    faqs: [
        {
            question: 'How do you split a villa between friends?',
            answer: 'Put every shared cost in one place as it happens, under the person who paid it, and divide the nightly rate by the people sleeping there. The room nets the whole week down at the end, so a group makes two or three transfers rather than twenty.',
        },
        {
            question: 'What if one couple gets the room with the balcony?',
            answer: 'Weight the bedrooms before the bags go in, then type each person’s share of the booking rather than letting it divide evenly. Everything after the booking — the car, the food, the taxis — usually goes back to an even split, because nobody’s bedroom made those bigger.',
        },
        {
            question: 'Does everybody need to install something?',
            answer: 'No. The link is the room, and it opens in whatever browser is already on the phone. Nobody makes an account, so the only thing anybody has to do is say which name is theirs.',
        },
    ],
    related: [
        { href: '/split-airbnb-cost-unequal-rooms', label: 'Splitting a booking when the rooms are not equal' },
        { href: '/blog/fronting-a-group-trip', label: 'Fronting a group trip without being the bank' },
    ],
}
