/**
 * Structured data, server-rendered. `dangerouslySetInnerHTML` is the only way to emit a raw
 * JSON-LD payload — React would escape the quotes in a text child and crawlers would see
 * nothing. The payload is built from our own frontmatter, never from user input.
 *
 * Returns null for a null schema so callers can pass an optional builder's result straight in.
 */
export function JsonLd({ data }: { data: unknown | null }) {
    if (!data) return null
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}

export default JsonLd
