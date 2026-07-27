import { marketingCopy } from './copy'

const { table } = marketingCopy.compare

/**
 * A comparison "table" rendered as stacked rows rather than a <table>. Split is read on a
 * phone first, and a two-column table at 360px either scrolls sideways or shrinks the text
 * to nothing. Each row carries its own column labels so the comparison survives the stack.
 */
export function CompareTable() {
    return (
        <section className="mx-auto w-full max-w-xl px-5">
            <h2 className="text-h5">{table.title}</h2>
            <ul className="mt-4 flex flex-col gap-3">
                {table.rows.map((row) => (
                    <li key={row.feature} className="rounded-sm border border-n-1 bg-white p-4">
                        <p className="text-h7">{row.feature}</p>
                        <dl className="mt-3 flex flex-col gap-3">
                            <div className="rounded-sm border border-n-1 bg-primary-3 p-3">
                                <dt className="text-h9 uppercase tracking-wide text-n-1">{table.splitLabel}</dt>
                                <dd className="mt-1 text-sm leading-5 text-n-1">{row.split}</dd>
                            </div>
                            <div className="rounded-sm border border-grey-2 bg-grey-3 p-3">
                                <dt className="text-h9 uppercase tracking-wide text-grey-1">{table.otherLabel}</dt>
                                <dd className="mt-1 text-sm leading-5 text-grey-1">{row.other}</dd>
                            </div>
                        </dl>
                    </li>
                ))}
            </ul>
            <p className="mt-3 text-sm text-grey-1">{table.footnote}</p>
        </section>
    )
}

export default CompareTable
