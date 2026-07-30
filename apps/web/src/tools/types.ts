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
 * **Every string a reader sees lives in `copy`, `meta`, `fields` or `faqs`.** They are gated as a
 * set in `content.test.ts`. Copy written inline in a component is copy nothing checks.
 */

/**
 * What kind of number a field holds, which is also how it is parsed and rendered.
 *
 * `amount` is the only one that goes through the money parser: it is typed in major units in the
 * reader's own punctuation ("1.234,56" or "1,234.56") and reaches `compute` as minor units.
 */
export type ToolFieldKind = 'amount' | 'count' | 'percent' | 'number' | 'toggle'

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
}

/**
 * A column in the per-person table. `requiresToggle` is what lets a method be optional without a
 * second tool: the income column exists in the schema always and is asked for only when the reader
 * turns income weighting on.
 */
export interface ToolRowColumn extends ToolField {
    requiresToggle?: string
}

/** The per-person table. Its length follows a scalar field, so "how many people" is asked once. */
export interface ToolRows {
    /** Name of the `count` field that says how many rows there are. */
    countField: string
    /** Label on the row's own name input. */
    nameLabel: string
    /** Default row names: `${namePrefix} 1`, `${namePrefix} 2`. Overwritable by the reader. */
    namePrefix: string
    columns: ToolRowColumn[]
}

export interface ToolRowInput {
    name: string
    values: Record<string, number>
}

export interface ToolInput {
    /** Scalar fields. `amount` fields are already minor units. */
    values: Record<string, number>
    toggles: Record<string, boolean>
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
 * Reference data a tool reads, with the provenance to check it.
 *
 * No tool carries one yet. It is declared now because the tool that will — mileage, against
 * per-country reimbursement rates — must arrive as data with a source and a date rather than as
 * numbers typed into a config, and the gate that checks the provenance is cheaper to write before
 * there is a page depending on it.
 */
export interface ToolData<Row = Record<string, unknown>> {
    /** Bumped whenever a row changes. Lets a cached answer be told apart from a stale one. */
    version: string
    /** The page the rows were read off. Checked for https by the registry gate. */
    sourceUrl: string
    /** ISO date the source was last opened. Not the date the file was edited. */
    retrievedAt: string
    rows: readonly Row[]
}

export interface ToolCopy {
    /** The query as a person types it. Also the `<h1>`. */
    h1: string
    /** Server-rendered intro. The answer arrives in the first two sentences. */
    intro: string[]
    formTitle: string
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

export interface Tool {
    /** Root-level path, no leading slash. Reserved against the content tree by `static-pages.ts`. */
    slug: string
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
    rows?: ToolRows
    faqs: ToolFaq[]
    data?: ToolData
    compute: (input: ToolInput) => ToolOutcome
}
