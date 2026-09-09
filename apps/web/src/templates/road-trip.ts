import type { RoomTemplate } from './types'

/** Shared driving costs and other road trip expenses. */
export const roadTrip: RoomTemplate = {
    slug: 'road-trip',
    updated: '2026-09-09',
    room: { name: 'Road trip', emblem: 'van' },
    meta: {
        title: 'Split a road trip: fuel, tolls and car hire',
        description:
            'Track fuel, tolls, parking and car hire in one shared room. Record who paid each expense and split it among the people travelling.',
    },
    headTerm: 'split a road trip',
    copy: {
        h1: 'Split a road trip: fuel, tolls and car hire',
        intro: [
            'Record each shared road trip expense under the person who paid it, then choose who shares the cost. Split calculates the balances across fuel, tolls, accommodation and other expenses.',
            'This template starts a room called Road trip. Create it before you leave and share the link with the people travelling.',
        ],
        lines: {
            title: 'Road trip costs to include',
            intro: 'Choose how to cover the car costs: share the actual expenses or pay the owner a distance rate. If that rate includes fuel, do not add the same fuel cost again.',
            items: [
                'Car hire, or an agreed contribution for using someone’s car',
                'Fuel, if it is not already covered by a distance rate',
                'Tolls and congestion charges',
                'Parking',
                'Overnight accommodation',
                'Shared meals and snacks',
            ],
        },
        concession: {
            title: 'For a single shared drive',
            body: 'If one person pays one petrol bill, dividing it and sending them your share may be enough. Use a room when several people pay for different parts of the trip and you want to combine those expenses before repaying each other.',
        },
        ctaTitle: 'Create your road trip room',
    },
    faqs: [
        {
            question: 'How do you split fuel on a road trip?',
            answer: 'Agree on the fuel used for the shared journey. Starting and finishing with a full tank can help separate trip fuel from fuel already in the car. Record each relevant purchase and who paid. If someone travels only part of the route, agree on their share instead of automatically dividing every fill equally.',
        },
        {
            question: 'What do you charge for using somebody’s own car?',
            answer: 'Agree on the contribution with the car owner before travelling. You can share actual fuel costs or use a rate per kilometre that also covers wear and other running costs. Specify what the rate includes so that fuel and other costs are not counted twice.',
        },
        {
            question: 'Can it work with no signal in the mountains?',
            answer: 'You can add an expense without a connection once the room is available on your device. It is queued on that device and sent when the connection returns. The queue holds up to thirty expenses per device. Editing, deleting and recording a repayment need a connection.',
        },
    ],
    related: [
        { href: '/mileage-split-calculator', label: 'Calculate a shared mileage cost' },
        { href: '/blog/split-expenses-offline', label: 'Adding expenses offline' },
    ],
}
