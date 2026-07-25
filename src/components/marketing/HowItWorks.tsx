import { marketingCopy } from './copy'

const { how } = marketingCopy

/**
 * Three steps on a full-bleed textured band, so the page has one patterned stretch instead of
 * an unbroken run of cream. The peanut tile is knocked back to 20% — at full strength it reads
 * as leopard print rather than as peanuts.
 */
export function HowItWorks() {
    return (
        <section className="relative border-y border-n-1 bg-white py-8">
            <div
                aria-hidden="true"
                className="bg-peanut-repeat-normal pointer-events-none absolute inset-0 opacity-20"
            />
            <div className="relative mx-auto w-full max-w-xl px-5">
                <div className="shadow-4 rounded-sm border border-n-1 bg-white">
                    <h2 className="border-b border-n-1 px-5 py-4 text-h5">{how.title}</h2>
                    <ol className="flex flex-col divide-y divide-n-1">
                        {how.steps.map((step) => (
                            <li key={step.n} className="flex items-start gap-4 px-5 py-4">
                                <span
                                    aria-hidden="true"
                                    className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-primary-1 font-display text-h6 leading-none"
                                >
                                    {step.n}
                                </span>
                                <span className="flex-1">
                                    <span className="block text-h7">{step.title}</span>
                                    <span className="mt-1 block text-sm leading-5 text-grey-1">{step.body}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            </div>
        </section>
    )
}

export default HowItWorks
