/**
 * What is left of the marketing copy after i18n: the import page, and only it.
 *
 * Everything else that used to live here — hero, rooms, how-it-works, honesty strip, footer,
 * install prompt — moved into `src/i18n/messages/*.json` and is rendered through
 * `useTranslations`. The Splitwise comparison left last, into the content engine
 * (`src/content/alternatives/splitwise-alternative/`), where its three languages are three
 * markdown files held to the same gates as every other article.
 *
 * Follow src/content/_system/stylebook.md and product-truths.md for copy and claims.
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
            title: 'Import your Splitwise group',
            description:
                'Import a Splitwise CSV into Peanut Split. Check expenses and balances before creating a room. Everyone joins through a link, with no account needed.',
        },
        hero: {
            eyebrow: 'splitwise import',
            title: 'Import a Splitwise group',
            body: 'Export your group as a spreadsheet, then upload it here. Check the preview before creating a room and sharing its link.',
        },
        honest: {
            title: 'What to expect',
            items: [
                {
                    title: 'The file never leaves your device',
                    body: 'Your browser reads the file. When you confirm the import, it sends the expense data needed to create the room.',
                },
                {
                    title: 'Check the balances before importing',
                    body: 'If the export has a “Total balance” row, the preview compares the calculated balances with it and shows any differences.',
                },
                {
                    title: 'Old exchange rates are not in the file',
                    body: 'Expenses in other currencies use the day’s indicative rate. Historical rates are not included in the export, so converted balances may differ. Single-currency groups are unaffected.',
                },
                {
                    title: 'Settle-ups arrive as expenses',
                    body: 'Imported repayments appear as expense rows. They still count towards each person’s balance.',
                },
            ],
        },
        faq: {
            title: 'Common questions',
            items: [
                {
                    q: 'How do I export my group from Splitwise?',
                    a: 'Open the group on the Splitwise website. In group settings, choose “Export as spreadsheet”, then upload the CSV file here. Split Pro JSON and CSV exports also work.',
                },
                {
                    q: 'Does everyone in my group have to sign up?',
                    a: 'No. Share the room link after importing. Each person opens it and picks their name from the imported list.',
                },
                {
                    q: 'Is my data uploaded anywhere?',
                    a: 'Your browser reads the file locally. When you confirm, it sends the expense data to create the shared room. The original file stays on your device.',
                },
                {
                    q: 'What if the file has something we cannot read?',
                    a: 'The preview lists skipped rows and explains why they could not be read. Check those warnings before confirming the import.',
                },
                {
                    q: 'How big a group can I import?',
                    a: 'Up to 20 people and about five thousand expenses per file. The imported room holds 500 rows: recent expenses appear in full, and older ones are combined into “Balance brought forward” entries. Those entries preserve the older balances.',
                },
                {
                    q: 'Can I import into a room I already have?',
                    a: 'Yes, from inside that room. Importing the same file twice changes nothing. A changed file is added in full, so it may duplicate expenses from an earlier import.',
                },
            ],
        },
        related: {
            title: 'Keep reading',
            label: 'Compare Split with Splitwise',
            href: '/splitwise-alternative',
        },
        cta: {
            title: 'Start a new room',
            body: 'If the old balances are already settled, skip the file and open an empty room.',
            button: 'Start a split',
            href: '/new?campaign=import-fallback',
        },
    },
} as const
