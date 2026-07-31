interface CompareFaqProps {
    title: string
    items?: readonly { q: string; a: string }[]
}

/**
 * Answers are always visible rather than behind an accordion: this page is read by someone
 * deciding whether to bother, and a collapsed answer is an answer they don't read. It also
 * keeps the text in the DOM for crawlers rather than leaning on the JSON-LD alone.
 */
export function CompareFaq({ title, items = [] }: CompareFaqProps) {
    return (
        <section className="mx-auto w-full max-w-xl px-5">
            <h2 className="text-h5">{title}</h2>
            <ul className="mt-4 flex flex-col gap-3">
                {items.map((item) => (
                    <li key={item.q} className="rounded-sm border border-n-1 bg-white p-4">
                        <h3 className="text-h7">{item.q}</h3>
                        <p className="mt-2 text-sm leading-5 text-grey-1">{item.a}</p>
                    </li>
                ))}
            </ul>
        </section>
    )
}

export default CompareFaq
