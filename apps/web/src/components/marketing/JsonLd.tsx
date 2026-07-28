/**
 * Structured data, server-rendered. `dangerouslySetInnerHTML` is the only way to emit a raw
 * JSON-LD payload — React would escape the quotes in a text child and crawlers would see
 * nothing. The payload is built from our own frontmatter, never from user input.
 *
 * Returns null for a null schema so callers can pass an optional builder's result straight in.
 */
export function JsonLd({ data }: { data: unknown | null }) {
    if (!data) return null
    // JSON.stringify does not escape `<`, so a title containing `</script>` would close the tag
    // and everything after it would be parsed as markup. Nothing outside this repo feeds these
    // schemas today; the escape is what keeps that from mattering the day something does.
    const json = JSON.stringify(data).replace(/</g, '\\u003c')
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}

export default JsonLd
