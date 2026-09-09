/**
 * Shared template copy. Product claims follow `_system/product-truths.md` and are checked
 * alongside the individual templates in `templates.test.ts`.
 */
export const TEMPLATE_CTA_LABEL = 'Start a split'
export const TEMPLATE_CTA_HINT = 'Use Split in your browser without an account.'
export const TEMPLATE_FAQ_TITLE = 'Questions'
export const TEMPLATE_RELATED_TITLE = 'Related guides'

/** The defaults shown before the user creates a room. */
export const TEMPLATE_SETUP = {
    title: 'Room defaults',
    name: 'Name',
    currency: 'Currency',
    currencyFromDevice: 'Suggested by your device',
    emblem: 'Icon',
    hint: 'Add your name on the next screen. You can change these defaults before creating the room.',
}

/** Practical limits, based on `_system/product-truths.md`. */
export const TEMPLATE_GOOD_TO_KNOW = {
    title: 'Good to know',
    body: [
        'The official service is free to use and has no paid tier.',
        'Split supports automatic conversion for 156 currencies at the day’s indicative rate.',
        'A room holds up to twenty people.',
        'Split records repayments. It does not move money or verify payments with a bank.',
    ],
} as const

/** The hub at `/t`. A listing rather than a template, so its copy lives beside the shared strings. */
export const TEMPLATES_HUB = {
    title: 'Expense sharing templates',
    description:
        'Start a shared expense room for a holiday, road trip, festival or household. Each template fills in the room details for you to review.',
    h1: 'Expense sharing templates',
    /** The line under each row on the hub. The room name follows it. */
    opens: 'Room name:',
    intro: 'Choose a template, review the room details and add your name. Once you create the room, share its link so the group can add expenses. No account is needed.',
}
