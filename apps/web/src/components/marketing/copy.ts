/**
 * What is left of the marketing copy after i18n: the import page, and only it.
 *
 * Everything else that used to live here — hero, rooms, how-it-works, honesty strip, footer,
 * install prompt — moved into `src/i18n/messages/*.json` and is rendered through
 * `useTranslations`. The Splitwise comparison left last, into the content engine
 * (`src/content/alternatives/splitwise-alternative/`), where its three languages are three
 * markdown files held to the same gates as every other article.
 *
 * Rules for whoever edits this: keep it honest. "Free to use" describes the current hosted policy,
 * not the service's lifetime; "settle however you like" must never imply the Peanut path is safer
 * than cash.
 */
export const marketingCopy = {
    /**
     * The import page. English on purpose: its <title>, its description and its FAQPage JSON-LD
     * are built from these strings at module scope, and a body rendered in Spanish under English
     * structured data is a rich-result mismatch.
     *
     * The IMPORTER ITSELF is not here — it is product surface, it is localised, and its copy lives
     * in the message catalogs under `import.*`. This block is only the frame a search engine reads.
     *
     * Keep the honesty section honest: historic FX really is converted at the day's indicative
     * rate, and settle-ups really do arrive as expenses. Both are stated here before anyone
     * uploads anything.
     */
    importPage: {
        meta: {
            title: 'Import your Splitwise group — free to use, no account',
            description:
                'Move a Splitwise group to Peanut Split: export it as a spreadsheet, drop the file in, and check every expense and balance before anything is created.',
        },
        hero: {
            eyebrow: 'splitwise import',
            title: 'Bring your group’s history with you',
            body: 'Export the group as a spreadsheet and drop the file in. You get a room link to paste into the group chat, with every expense and balance already in it.',
        },
        honest: {
            title: 'What to expect',
            items: [
                {
                    title: 'The file never leaves your device',
                    body: 'It is read in your browser. What reaches us is the list of expenses, not the document — and nobody has to make an account for any of it.',
                },
                {
                    title: 'Balances match to the cent',
                    body: 'Splitwise records what each person came out ahead or behind by, and that is what the imported room reproduces. If your export has a “Total balance” row, the preview compares against it and tells you either way.',
                },
                {
                    title: 'Old exchange rates are not in the file',
                    body: 'A group that spent in more than one currency is converted at the day’s indicative rate, because Splitwise does not export the rate it used on the day. Single-currency groups are unaffected.',
                },
                {
                    title: 'Settle-ups arrive as expenses',
                    body: 'Payments between people come across as rows in the history rather than as recorded settlements. The balances come out identical either way.',
                },
            ],
        },
        faq: {
            title: 'Questions people actually ask',
            items: [
                {
                    q: 'How do I export my group from Splitwise?',
                    a: 'Open the group on the web, use the group settings menu, and choose “Export as spreadsheet”. Splitwise emails or downloads a .csv file — that is the file to drop here. A Split Pro download works too, as .json or .csv.',
                },
                {
                    q: 'Does everyone in my group have to sign up?',
                    a: 'No. The import creates a room and a link. Everyone else opens the link, picks their name from the list you imported, and they are in.',
                },
                {
                    q: 'Is my data uploaded anywhere?',
                    a: 'The file is opened and read by your own browser. We receive the expenses it contains in order to build the room, and never the file itself.',
                },
                {
                    q: 'What if the file has something we cannot read?',
                    a: 'You see it before anything is created. The preview lists every row that was skipped and why, and nothing is written until you press the button.',
                },
                {
                    q: 'How big a group can I import?',
                    a: 'Up to 20 people, and up to about five thousand expenses in the file. Bigger groups are not what Split is for — it is built for a trip, a flat or a dinner. A long history still works: a room holds 500 expenses, so the most recent come across in full and everything older is folded into a “Balance brought forward” entry, which leaves every balance the same.',
                },
                {
                    q: 'Can I import into a room I already have?',
                    a: 'Yes, from inside that room. Importing the same file twice changes nothing; a changed file is added in full.',
                },
            ],
        },
        related: {
            title: 'Keep reading',
            label: 'What Split does and does not do compared with Splitwise',
            href: '/splitwise-alternative',
        },
        cta: {
            title: 'Or start a room without the history',
            body: 'If the old balances are already settled, skip the file and open an empty room.',
            button: 'Start a split',
            href: '/new?campaign=import-fallback',
        },
    },
} as const
