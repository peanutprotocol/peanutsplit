import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { DocChrome } from '../_components/DocChrome'
import { ReviewPicker } from './_components/ReviewPicker'

export const metadata: Metadata = {
    title: 'UX review — Peanut Split',
    description: 'Representative UX mockups and recorded decisions for Peanut Split design-system changes.',
}

const noMockupItems = [
    [
        'ARCH-02 / ARCH-03',
        'Workflow and query seams',
        'Extract pure state and split query domains behind unchanged UI and cache contracts.',
    ],
    [
        'PERF-01',
        'Doodle delivery',
        'Chunk or lazy-load artwork with bundle tests; the drawings themselves stay the same.',
    ],
    [
        'PERF-03 / PERF-04',
        'Static SEO shell',
        'Separate public and app runtime concerns while preserving rendered pages and canonical content.',
    ],
    [
        'DS-02 / DS-03 / DS-06',
        'Parity-only consolidation',
        'Canonicalize proven tokens, recipes and button-link styles with screenshot parity.',
    ],
    ['DS-04', 'Component shims', 'Fold temporary shims into owners only with pixel and behavior parity.'],
    ['DS-07', 'Invalid utility classes', 'Replace two silent no-op classes with existing reviewed tokens.'],
    ['DS-09', 'Test selectors in CSS', 'Move styling to semantic component or state hooks.'],
    ['I18N-02', 'Error-code parity', 'Add the missing translations and a small contract test.'],
    [
        'I18N-01',
        'Catalog localization',
        'Use linguistic and overflow QA for translated labels; no interaction redesign is implied.',
    ],
    ['QUAL-01', 'Semantic lint', 'Tooling and a ratcheted baseline need code review, not product-design review.'],
    ['SEC-04', 'Private caching', 'Add private, no-store defaults and route tests.'],
    [
        'DOMAIN-01',
        'Write invariants',
        'Fix the two known archived-room omissions without inventing a command framework.',
    ],
] as const

export default function ReviewPage() {
    return (
        <DocChrome page="review">
            <div className="border-b border-n-1 bg-primary-1">
                <div className="mx-auto grid max-w-[90rem] gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-8">
                    <div className="max-w-4xl">
                        <p className="shadow-2 inline-flex rounded-full border border-n-1 bg-white px-3 py-1 text-h9 uppercase tracking-[0.16em]">
                            Manual review · representative mockups
                        </p>
                        <h1 className="mt-5 max-w-4xl font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.045em] sm:text-7xl">
                            Seven visible choices. No product code changed.
                        </h1>
                        <p className="mt-6 max-w-3xl text-lg leading-8">
                            Compare the current pattern with a proposed direction, record a decision and leave the
                            implementation team a note. These are design specimens—not a hidden rewrite of the live app.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <a
                                href="#review-picker"
                                className="btn btn-dark shadow-4 w-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                                Start the review
                                <Icon name="arrow-right" size={18} />
                            </a>
                            <Link
                                href="/dev-ds/audit"
                                className="btn btn-stroke w-auto bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                                Audit evidence
                            </Link>
                        </div>
                    </div>
                    <aside className="shadow-4 rounded-sm border-2 border-n-1 bg-white p-6">
                        <p className="text-h9 uppercase tracking-[0.18em] text-grey-1">Review boundary</p>
                        <p className="mt-3 text-h5">Polish before machinery</p>
                        <p className="mt-3 text-sm leading-6 text-grey-1">
                            Approve interaction foundations now. Defer systems built for scale until roughly 1,000
                            rooms, product-market fit, demand, or a measured bottleneck.
                        </p>
                    </aside>
                </div>
            </div>

            <div className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8">
                <ReviewPicker />

                <section className="border-t border-n-1 py-12 sm:py-16" aria-labelledby="no-mockup-title">
                    <p className="text-h9 uppercase tracking-[0.18em] text-grey-1">Engineering lane</p>
                    <h2 id="no-mockup-title" className="mt-2 font-display text-4xl font-extrabold">
                        These changes need verification, not mockups
                    </h2>
                    <p className="mt-3 max-w-3xl text-base leading-7 text-grey-1">
                        They should preserve the rendered product and can proceed with focused tests, screenshots or
                        compiled-output checks. Pulling them into visual review would create ceremony without a design
                        decision.
                    </p>
                    <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {noMockupItems.map(([id, title, body]) => (
                            <article key={id} className="shadow-2 rounded-sm border border-n-1 bg-white p-5">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-h7">{title}</h3>
                                    <span className="rounded-full border border-n-1 bg-primary-3 px-2 py-1 text-[0.65rem] font-extrabold uppercase tracking-wider">
                                        {id}
                                    </span>
                                </div>
                                <p className="mt-3 text-sm leading-6 text-grey-1">{body}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="border-t border-n-1 py-12 sm:py-16" aria-labelledby="ideas-title">
                    <div className="shadow-4 grid gap-6 rounded-sm border-2 border-n-1 bg-n-1 p-6 text-white lg:grid-cols-[minmax(0,1fr)_18rem] lg:p-8">
                        <div>
                            <p className="text-h9 uppercase tracking-[0.18em] text-primary-1">
                                Scale / ideas · DATA-01
                            </p>
                            <h2 id="ideas-title" className="mt-2 font-display text-4xl font-extrabold">
                                Anonymous room management is deliberately deferred
                            </h2>
                            <p className="mt-4 max-w-3xl text-base leading-7 text-grey-2">
                                A separate management capability could eventually rotate a share link, archive or delete
                                a room without requiring accounts. That direction is documented, but it is not a current
                                flow and there is nothing to approve here yet.
                            </p>
                        </div>
                        <div className="rounded-sm border border-white bg-white p-5 text-n-1">
                            <p className="text-h7">Reopen only when</p>
                            <ul className="mt-3 space-y-2 text-sm leading-5 text-grey-1">
                                <li>• Roughly 1,000 rooms or PMF</li>
                                <li>• A genuine rotate/delete request</li>
                                <li>• A concrete legal obligation</li>
                                <li>• Measured audit-table pressure</li>
                            </ul>
                            <p className="mt-4 border-t border-n-1 pt-4 text-xs font-bold uppercase tracking-wider">
                                Mockups required when reopened
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </DocChrome>
    )
}
