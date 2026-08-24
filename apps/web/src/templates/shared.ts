/**
 * The strings every template page prints, kept out of the configs on purpose.
 *
 * The CTA label is §9's locale string, the hint under it is §9's, and the practical facts are
 * product truth rather than copy anybody writes per page. A config field for any of them is a
 * field one template eventually fills in differently, and the difference would be a claim.
 *
 * Gated with the configs in `templates.test.ts`, because a reader cannot tell which of these
 * sentences came from a shared constant.
 */
export const TEMPLATE_CTA_LABEL = 'Start a split'
export const TEMPLATE_CTA_HINT = 'Takes ten seconds. No email, no password, no download.'
export const TEMPLATE_FAQ_TITLE = 'Questions'
export const TEMPLATE_RELATED_TITLE = 'Keep reading'

/** The panel that shows what the link has already decided, so the page is not claiming it blind. */
export const TEMPLATE_SETUP = {
    title: 'What this link sets up',
    name: 'The room is called',
    currency: 'It counts in',
    currencyFromDevice: 'whatever your phone suggests',
    emblem: 'And it looks like this',
    hint: 'Your own name is the only thing left to fill in, and you can change any of the rest before you open it.',
}

/** §4.4: flat, neutral, and each one traceable to `_system/product-truths.md`. */
export const TEMPLATE_GOOD_TO_KNOW = {
    title: 'Good to know',
    body: [
        'The official service is free to use and has no paid tier.',
        'Automatic conversion for 156 currencies at the day’s indicative rate.',
        'A room holds up to twenty people.',
        'Split records a payment rather than making one. It does not check with a bank and cannot.',
    ],
} as const

/** The hub at `/t`. A listing rather than a template, so its copy lives beside the shared strings. */
export const TEMPLATES_HUB = {
    title: 'Rooms that arrive already set up',
    description:
        'Six links, each one a room with the name, the currency and the drawing already chosen. Tap one, add your name, and send it to the group.',
    h1: 'Rooms that arrive already set up',
    /** The line under each row on the hub. The room name follows it. */
    opens: 'Opens a room called',
    intro: 'Each of these is one link. It opens a room with the name and the currency already filled in, so the only thing left to type is your own name. Nobody makes an account and nothing gets installed.',
}
