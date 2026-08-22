/**
 * The shape of a fairness microtool.
 *
 * A tool is one TypeScript config: its slug, its search metadata, the fields it asks for, the pure
 * function that turns those fields into per-person amounts, and every user-facing string it prints.
 * Nothing else. Routes, the sitemap, the reserved-slug set and the style gate all derive from the
 * registry, so adding a tool is adding a file — the same contract `src/content` has for an article.
 *
 * Two rules the shape enforces rather than documents:
 *
 * **Compute knows nothing about currency symbols.** Amounts cross this boundary as integer minor
 * units and come back as integer minor units, so the arithmetic reconciles to the cent and the
 * formatting stays in one place. A `compute` that returned "€12.34" would be a second money
 * formatter, and the two would disagree the first time somebody picked a zero-decimal currency.
 *
 * **Every string a reader sees lives in `copy`, `meta`, `fields`, `faqs` or `phrases`.** They are
 * gated as a set in `content.test.ts`, in every locale. Copy written inline in a component — or
 * inline in `compute` — is copy nothing checks and nothing can translate.
 */

import type { DoodleName } from '@/components/ui/doodles'
import type { IndexedLocale } from '@/i18n/locales'

/**
 * What kind of number a field holds, which is also how it is parsed and rendered.
 *
 * `amount` is the only one that goes through the money parser: it is typed in major units in the
 * reader's own punctuation ("1.234,56" or "1,234.56") and reaches `compute` as minor units.
 *
 * `scale` is a number the reader answers by dragging rather than typing. It exists because one
 * question on this site is not a quantity anybody actually knows — "how much money are you on" —
 * and a box asking for a monthly figure gets a lie or a blank. A notch on a labelled slider is
 * the honest instrument for it, and what the notches mean is stated in the tool's own FAQ.
 */
export type ToolFieldKind = 'amount' | 'count' | 'number' | 'toggle' | 'scale'

export interface ToolField {
    /** Key in `ToolInput.values` (or `ToolInput.toggles`). Unique within a tool. */
    name: string
    kind: ToolFieldKind
    label: string
    /** One flat sentence under the input. */
    help?: string
    /** Major units for `amount`, the plain number otherwise, `1`/`0` for a toggle. */
    defaultValue: number
    min?: number
    max?: number
    step?: number
    /** Printed after the input — "sqm", "%". Never a currency symbol; the currency is the shell's. */
    unit?: string
    /**
     * `scale` only: one label per notch, lowest first. The field's value is the 1-based notch, so
     * `notches.length` is the top of the scale and the labels are what the reader is choosing
     * between. Copy, and gated as copy.
     */
    notches?: readonly string[]
}

/** The per-person table. Its length follows a scalar field, so "how many people" is asked once. */
export interface ToolRows {
    /** Name of the `count` field that says how many rows there are. */
    countField: string
    /** Label on the row's own name input. */
    nameLabel: string
    /** Default row names: `${namePrefix} 1`, `${namePrefix} 2`. Overwritable by the reader. */
    namePrefix: string
    columns: ToolField[]
}

export interface ToolRowInput {
    name: string
    values: Record<string, number>
}

/**
 * A named option in a picker.
 *
 * The picker exists because one tool wanted a field whose answer is a name rather than a number:
 * the country whose official rate a shared drive is costed at. `sets` is what makes it more than a
 * label — choosing an option writes numbers into the fields below it, which is how an official
 * figure can be a pre-filled default that the reader is still free to type over.
 */
export interface ToolChoiceOption {
    value: string
    label: string
    /**
     * Field text to pre-fill on choosing this option, keyed by field name. Written as the reader
     * would type it, because that is what the input holds — "0.30", not 30.
     */
    sets?: Record<string, string>
    /** Currency the option's numbers are in. Switches the shell's currency with the choice. */
    currency?: string
    /** One flat line under the picker: what the number is, and what it deliberately leaves out. */
    note?: string
    /** The page the number was read off, named so the reader can go and check it. */
    source?: { label: string; href: string }
}

/**
 * The optional way to answer one field, folded away behind a summary until it is asked for.
 *
 * It exists for the reader who rejects the pre-filled default and would otherwise type a guess.
 * Rather than argue with the guess, the builder asks for the two or three things that guess is
 * made of and does the arithmetic in front of them.
 *
 * **Nothing here reaches `compute`.** The builder writes one number into one ordinary field when
 * the reader presses the button, and the field is ordinary state afterwards. That is what keeps it
 * genuinely optional: a builder left closed, or opened and abandoned, changes no result.
 */
export interface ToolBuilder {
    /** Field name this writes its answer into. Must be a `number` field on the same tool. */
    target: string
    /** The closed state: what the fold offers, in one clause. */
    summary: string
    /** The open state's heading. */
    title: string
    /** One flat line under the heading: what this is for. */
    intro: string
    fields: ToolField[]
    /** The floor line — what the answer would be if the only cost were fuel. */
    floorLabel: string
    /** The line the button will write into `target`. */
    totalLabel: string
    applyLabel: string
    appliedLabel: string
    /**
     * Pure: the builder's own fields, in major units, to the two figures it prints.
     *
     * Major units throughout, deliberately. `target` holds a per-distance rate that carries more
     * decimals than any currency does, so putting this through the minor-unit boundary would round
     * a real rate into an unreal one before it ever reached the arithmetic.
     */
    derive: (values: Record<string, number>) => { floor: number; total: number }
}

export interface ToolChoiceField {
    name: string
    label: string
    help?: string
    /** Must be one of `options[].value`. */
    defaultValue: string
    options: readonly ToolChoiceOption[]
}

export interface ToolInput {
    /** Scalar fields. `amount` fields are already minor units. */
    values: Record<string, number>
    /** The page's own language, handed in as words. See `Tool.phrases`. */
    phrases: Record<string, string>
    toggles: Record<string, boolean>
    /** Picked option values, keyed by choice-field name. */
    choices: Record<string, string>
    /** One entry per person, in display order. */
    rows: ToolRowInput[]
    /** Minor units the chosen currency uses — 2 for EUR, 0 for JPY. */
    decimals: number
}

export interface ToolShare {
    label: string
    amountMinor: number
    /** The working behind this one row (§8.3). Never money — the shell owns money formatting. */
    detail: string
}

/**
 * One line of the derivation, rendered as a label and a figure. Structured rather than a sentence
 * because half of these figures are money and money is formatted by the shell, in the reader's
 * chosen currency.
 */
export interface ToolWorking {
    label: string
    amountMinor?: number
    /** A non-money figure: "5.5 shares", "62 sqm". */
    value?: string
}

export interface ToolOutcome {
    shares: ToolShare[]
    /** What the shares must add up to. Asserted in every compute test. */
    totalMinor: number
    workings: ToolWorking[]
    /** Set when the inputs cannot produce a split. Replaces the result rather than joining it. */
    problem?: string
}

export interface ToolFaq {
    question: string
    answer: string
}

/**
 * One row of reference data, which is one number and the page it was read off.
 *
 * Provenance sits on the row rather than on the set because the first set to arrive — official
 * per-kilometre rates, one country at a time — has twelve sources and no index page. A single
 * `sourceUrl` beside twelve rows would have been a citation for one of them and decoration for
 * the other eleven.
 */
export interface ToolDataRow {
    /** The page this row was read off. Checked for https by the registry gate. */
    sourceUrl: string
}

/**
 * Reference data a tool reads, with the provenance to check it.
 *
 * Data rather than numbers typed into a config, because a rate is true on a date: the version and
 * the retrieval date are what let a reader — and the next person to edit this — tell a current
 * answer from a stale one.
 */
export interface ToolData<Row extends ToolDataRow = ToolDataRow> {
    /** Bumped whenever a row changes. Lets a cached answer be told apart from a stale one. */
    version: string
    /** ISO date the sources were last opened. Not the date the file was edited. */
    retrievedAt: string
    rows: readonly Row[]
}

export interface ToolCopy {
    /** The query as a person types it. Also the `<h1>`. */
    h1: string
    /** Server-rendered intro. The answer arrives in the first two sentences. */
    intro: string[]
    resultTitle: string
    /** Stands in for the result while the inputs cannot be divided. */
    resultHint: string
    /** Why the last cents land where they do. Stated once, beneath the result. */
    roundingNote: string
    /** The paste-able line for the group chat (§8.5). */
    copyLabel: string
    copyDone: string
    /**
     * §8.1 — name the objection the method invites, agree with its limit, give the boundary. Only
     * the fairness families need one; a bill split does not invite the argument.
     */
    method?: { title: string; body: string[] }
    /** §4.1 — exactly one, titled "When {Competitor} is the better tool". */
    concession: { title: string; body: string }
    /** §4.4 — flat practical facts, each in its own sentence. */
    goodToKnow: { title: string; body: string[] }
    cta: { title: string; body: string; label: string }
    faqTitle: string
}

/**
 * A tool in one language.
 *
 * Structure is not copy: which fields exist, what kind they are, what they default to and what the
 * arithmetic does are the same in every language, and repeating them per locale would be three
 * calculators to keep in step. So a translation supplies words only, keyed by the name the English
 * config already gave the thing — a field by `name`, a picker option by `value`.
 *
 * Nothing here falls back to English. A locale that omits a string gets a page missing that string,
 * which `content.test.ts` fails on, rather than a Spanish page with an English sentence in it.
 */
export interface ToolFieldWords {
    label: string
    help?: string
    unit?: string
    notches?: readonly string[]
}

export interface ToolChoiceWords {
    label: string
    help?: string
    /** Keyed by `options[].value`. The number, the currency and the source URL are not words. */
    options: Record<string, { label: string; note?: string }>
}

export interface ToolBuilderWords {
    summary: string
    title: string
    intro: string
    floorLabel: string
    totalLabel: string
    applyLabel: string
    appliedLabel: string
    fields: Record<string, ToolFieldWords>
}

export interface ToolWords {
    meta: { title: string; description: string }
    copy: ToolCopy
    /** Scalar fields and row columns alike, keyed by `name`. Builder fields live under `builder`. */
    fields: Record<string, ToolFieldWords>
    rows?: { nameLabel: string; namePrefix: string }
    choices?: Record<string, ToolChoiceWords>
    builder?: ToolBuilderWords
    /**
     * Onward links, replaced wholesale rather than relabelled: a Spanish reader is sent to the
     * Spanish pages that exist, which are not the same pages the English one links to.
     */
    related?: readonly { href: string; label: string }[]
    faqs: readonly ToolFaq[]
    phrases: Record<string, string>
}

export interface Tool {
    /** Root-level path, no leading slash. Reserved against the content tree by `static-pages.ts`. */
    slug: string
    /**
     * The drawing this tool is stood next to, on its own page and in the `/tools` list.
     *
     * From the app's own set, because the point of it is that a calculator looks like the thing
     * the CTA opens. Art only — the cast never speaks on a tool page and no character is named.
     */
    doodle: DoodleName
    /** ISO date of the last meaningful edit. The sitemap's `lastModified`. */
    updated: string
    /**
     * §3.10: the rent-and-utilities and couples-by-income families take the flat register — no
     * wink, no litotes, no interjection, no imperative "Just". Declared rather than inferred from
     * the slug so the gate can check the copy against the register the tool claims.
     */
    register: 'default' | 'flat'
    meta: {
        /** `pageTitle()` appends " | Peanut Split"; the gate measures the sum. */
        title: string
        description: string
    }
    copy: ToolCopy
    fields: ToolField[]
    /** Pickers, rendered above the numeric fields they pre-fill. */
    choices?: readonly ToolChoiceField[]
    /**
     * One-tap shortcuts rendered as a chip row above the fields, each one applying an existing
     * `choices[].options[]` entry the same way picking it from the dropdown already does — this
     * adds no new pre-fill mechanism, only a faster way to reach one that exists. `choiceName` must
     * match a `choices[].name` and `optionValue` one of that choice's `options[].value`.
     *
     * A chip wears its option's own label. Repeating the words here would be a second copy of a
     * string to translate, and the two would disagree in one language before they disagreed in all.
     */
    presets?: readonly { choiceName: string; optionValue: string }[]
    rows?: ToolRows
    /** The optional way to answer one field. At most one, because two folds is a form again. */
    builder?: ToolBuilder
    faqs: ToolFaq[]
    data?: ToolData
    /**
     * Two or three pages this reader is likely to want next. Sparse on purpose: a calculator that
     * ends in a wall of links is a calculator nobody scrolls past. Checked against the routes that
     * exist by `content.test.ts`, the same way an article's `<RelatedLink>` is.
     */
    related?: readonly { href: string; label: string }[]
    /**
     * The sentences `compute` prints — the problems it can report, its working labels, its per-row
     * detail — handed to it through `ToolInput` rather than written inside it. `{name}` placeholders
     * are filled by `fill()`.
     *
     * This is what keeps `compute` locale-free: it does the arithmetic and reaches for a phrase by
     * key, and one implementation serves every language. A sentence written inline in `compute`
     * would be an English string that a Spanish page renders and no gate reads.
     */
    phrases: Record<string, string>
    /**
     * The languages this tool is published in, English aside. A locale listed here is routed,
     * sitemapped and advertised in hreflang; a locale absent from it does not exist for this tool.
     */
    locales?: Partial<Record<Exclude<IndexedLocale, 'en'>, ToolWords>>
    compute: (input: ToolInput) => ToolOutcome
}
