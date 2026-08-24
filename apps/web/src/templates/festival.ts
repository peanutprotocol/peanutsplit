import type { RoomTemplate } from './types'

/**
 * The weekend whose biggest line was paid nine months earlier, by one person, in a queue.
 */
export const festival: RoomTemplate = {
    slug: 'festival',
    updated: '2026-08-24',
    room: { name: 'Festival', emblem: 'tent' },
    meta: {
        title: 'Split festival costs with the whole camp',
        description:
            'One person got the tickets in the sale nine months ago. A room for the ticket money, the van, the shop and the weekend, on a link nobody signs up for.',
    },
    headTerm: 'split festival costs',
    copy: {
        h1: 'Split festival costs when one person bought the tickets',
        intro: [
            'Somebody sat in a queue in October with six tabs open and got eight tickets. Nine months later four of those people have paid them back, two have paid part, and the person who bought them has stopped mentioning it because it has been too long.',
            'This link opens a room called Festival. Put the tickets in the day they are bought, at the price they were bought for, and the debt is a number on everybody’s screen from that afternoon rather than a favour that quietly goes bad.',
        ],
        lines: {
            title: 'What usually goes in a festival room',
            intro: 'The ticket line is the one that matters. Everything else is the weekend, and the weekend is cheap by comparison.',
            items: [
                'Tickets, at what they cost including the booking fee',
                'Coach or van hire, and the fuel',
                'The camping gear somebody bought for everybody',
                'The big shop before the gates',
                'Ice, wood and the things you buy twice because they got lost',
                'The taxi home on Monday morning',
            ],
        },
        concession: {
            title: 'When a bank transfer request still wins',
            body: 'One ticket bought for one friend is a single transfer and a room would be ceremony. This is for the camp of eight where the tickets, the van and the shop were paid by three different people at three different times, and nobody can hold the shape of it in their head.',
        },
        ctaTitle: 'Open the room the day the tickets clear',
    },
    faqs: [
        {
            question: 'How do you get people to pay for a festival ticket months later?',
            answer: 'Do not leave it months. Put the tickets in the room the day they are bought and send the link that afternoon, while everybody is still pleased about getting in. A number that has been visible since October is a fact by June; a number raised for the first time in June is a request.',
        },
        {
            question: 'What about the booking fee?',
            answer: 'It went on the same card, so it goes in the same line. Splitting it separately is more arithmetic for a figure that comes to a couple of pounds a head.',
        },
        {
            question: 'Someone dropped out and sold their ticket on. Now what?',
            answer: 'Record what the ticket sold for as a payment from the person who took it over, and settle the person leaving out. Whether they get the whole amount back is a decision the group makes, and the room is where that decision is written down rather than remembered differently by everybody.',
        },
    ],
    related: [
        { href: '/blog/fronting-a-group-trip', label: 'Fronting something for a group and being paid back' },
        { href: '/split-bill-no-signup', label: 'Splitting without anybody making an account' },
    ],
}
