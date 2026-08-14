/**
 * HowTo JSON-LD, built from the same `<Steps>`/`<Step>` grammar the page already renders
 * (`components/marketing/mdx/blocks.tsx`) — no new authoring, mirroring how `faqSchema` (seo.ts)
 * reads frontmatter FAQs rather than asking for a second copy of the answer.
 *
 * `extractSteps` reads the raw MDX body with the same regex-over-markdown idiom content.test.ts
 * already uses for `<FAQItem question="...">` (see content.test.ts:346,620) — an attribute-value
 * capture plus a `matchAll` over the block. A missing or unclosed tag simply fails to match, which
 * is what makes "malformed input returns null" free rather than a separate branch to maintain.
 */

export interface ExtractedStep {
    title: string
    text: string
}

export interface ExtractedSteps {
    title?: string
    steps: ExtractedStep[]
}

/** Null when the body has no complete `<Steps>…</Steps>` block, or that block has no complete
 *  `<Step title="…">…</Step>` children — an unclosed tag on either side never partially matches. */
export function extractSteps(body: string): ExtractedSteps | null {
    const stepsMatch = body.match(/<Steps(?:\s+title="([^"]*)")?\s*>([\s\S]*?)<\/Steps>/)
    if (!stepsMatch) return null

    const [, title, inner] = stepsMatch
    const steps = [...inner.matchAll(/<Step\s+title="([^"]*)"\s*>([\s\S]*?)<\/Step>/g)].map(([, stepTitle, text]) => ({
        title: stepTitle,
        text: text.trim(),
    }))
    if (steps.length === 0) return null

    return title ? { title, steps } : { steps }
}

/** Null when the body carries no Steps block — the same "nothing to declare" contract as
 *  `faqSchema` returning null for an empty FAQ list. */
export function howToSchema(name: string, url: string, body: string): Record<string, unknown> | null {
    const extracted = extractSteps(body)
    if (!extracted) return null

    return {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name,
        mainEntityOfPage: url,
        step: extracted.steps.map((step, index) => ({
            '@type': 'HowToStep',
            position: index + 1,
            name: step.title,
            text: step.text,
        })),
    }
}
