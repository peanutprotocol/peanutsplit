import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { breadcrumbSchema, pageMetadata, pageTitle } from '@/lib/seo'
import { publicFossReleased, publicSourceCommit } from '@/lib/flags'

const PATH = '/source'
const REPOSITORY = 'https://github.com/peanutprotocol/peanutsplit'

export function generateMetadata(): Metadata {
    // Metadata is part of the claim surface. Returning a static description here leaked the AGPL
    // claim into a raw RSC 404 even while the page body was correctly withheld.
    if (!publicFossReleased()) notFound()
    return pageMetadata({
        title: pageTitle('Source, self-hosting and stewardship'),
        description:
            'Peanut Split source, AGPL license, schema and API documentation, self-hosting limits, and Squirrel Labs stewardship.',
        path: PATH,
        type: 'website',
    })
}

const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'Source & stewardship', href: PATH },
]

const externalLink = 'font-semibold text-n-1 underline decoration-2 underline-offset-2 hover:opacity-70'

export default function SourceAndStewardshipPage() {
    if (!publicFossReleased()) notFound()
    // A build that names its commit gets pinned links; one that does not falls back to the branch
    // this service deploys from. Both are true statements — only the first is also reproducible.
    const commit = publicSourceCommit()
    const ref = commit ?? 'main'
    const sourceAtRef = `${REPOSITORY}/tree/${ref}`
    const fileAtRef = (path: string) => `${REPOSITORY}/blob/${ref}/${path}`

    return (
        <main className="flex min-h-dvh flex-col bg-background">
            <JsonLd data={breadcrumbSchema(crumbs)} />
            <Breadcrumbs crumbs={crumbs} />

            <header className="mt-4 border-y border-n-1 bg-primary-1">
                <div className="mx-auto w-full max-w-xl px-5 py-9">
                    <p className="text-h9 uppercase tracking-wide text-n-1">Source & stewardship</p>
                    <h1 className="mt-3 text-h3 leading-tight text-n-1">
                        The software, the service and who pays for it
                    </h1>
                    <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-n-1">
                        Peanut Split is free to use on the official service. Its released software is open source and
                        self-hostable. Those are separate promises, with separate receipts.
                    </p>
                </div>
            </header>

            <div className="mx-auto grid w-full max-w-xl gap-10 px-5 py-10 text-n-1">
                <section aria-labelledby="freedoms">
                    <h2 id="freedoms" className="text-h5">
                        Free to use is not the same as software freedom
                    </h2>
                    <div className="mt-4 grid gap-4 text-base leading-7">
                        <p>
                            The official service at peanutsplit.com is free to use and has no paid tier. That describes
                            the service today; it is not a promise that one host will stay online or zero-price forever.
                        </p>
                        <p>
                            Released source is licensed under AGPL-3.0-or-later. That is the FOSS promise: subject to
                            the license, you may inspect, run, modify, share and self-host the released software. The
                            rights on a version already released do not disappear if the official service or a later
                            release changes.
                        </p>
                    </div>
                </section>

                <section aria-labelledby="receipts">
                    <h2 id="receipts" className="text-h5">
                        Source and technical receipts
                    </h2>
                    <p className="mt-4 text-base leading-7">
                        The public repository is the source of truth. You can read, download or clone everything this
                        service runs on, and nothing here is a promise you have to take on trust.
                    </p>
                    <p className="mt-3 text-base leading-7">
                        {commit
                            ? 'This build names the commit it was made from, so the link below is that exact tree rather than whatever has since landed on the branch.'
                            : 'This build does not name its own commit, so the link below is the branch it deploys from. That branch moves, and we would rather say so than pin a commit that quietly goes stale.'}
                    </p>
                    <ul className="mt-4 grid gap-2 text-base leading-6">
                        <li>
                            <a className={externalLink} href={REPOSITORY}>
                                Public source repository
                            </a>
                        </li>
                        <li>
                            <a className={externalLink} href={sourceAtRef}>
                                {commit ? 'Exact deployed source commit' : 'The branch this service deploys from'}
                            </a>{' '}
                            <code className="break-all text-sm">{ref}</code>
                        </li>
                        <li>
                            <a className={externalLink} href={fileAtRef('LICENSE')}>
                                AGPL-3.0-or-later license
                            </a>
                        </li>
                        <li>
                            <a className={externalLink} href={fileAtRef('docs/current/DATA-MODEL.md')}>
                                Data model and schema
                            </a>
                        </li>
                        <li>
                            <a className={externalLink} href={fileAtRef('docs/current/API.md')}>
                                HTTP API reference
                            </a>
                        </li>
                        <li>
                            <a className={externalLink} href={fileAtRef('docs/current/SELF-HOSTING.md')}>
                                Self-hosting guide and limitations
                            </a>
                        </li>
                        <li>
                            <a className={externalLink} href={fileAtRef('docs/current/SECURITY-MODEL.md')}>
                                Security and capability model
                            </a>
                        </li>
                    </ul>
                </section>

                <section aria-labelledby="self-host">
                    <h2 id="self-host" className="text-h5">
                        What self-hosting means here
                    </h2>
                    <p className="mt-4 text-base leading-7">
                        The reference deployment is one Next.js application and PostgreSQL, with migrations in the
                        source tree and a Compose path for evaluation. An operator owns the domain and TLS, database
                        backups, secrets, upgrades, monitoring, privacy notices and any optional FX, push, model,
                        analytics or error integrations. The current reference topology is one application replica;
                        process-local wakeups and rate limits are documented limitations.
                    </p>
                </section>

                <section aria-labelledby="stewardship">
                    <h2 id="stewardship" className="text-h5">
                        Maintained and paid for by Squirrel Labs
                    </h2>
                    <div className="mt-4 grid gap-4 text-base leading-7">
                        <p>
                            Squirrel Labs is currently the sole maintainer of Peanut Split. It decides the upstream
                            roadmap and releases, and pays every project cost: maintainer work hours, infrastructure,
                            domains, third-party services and operation of peanutsplit.com.
                        </p>
                        <p>
                            The fair deal is that the official service may carry a few quiet, contextual references to{' '}
                            <a className={externalLink} href="https://peanut.me">
                                Peanut
                            </a>
                            , including an optional settlement method. They never require a click, nag the user, become
                            preselected, or gate a feature. They are part of the official hosted service, not a
                            condition of the AGPL license. Forks and self-hosters do not owe Peanut or Squirrel Labs
                            promotion.
                        </p>
                    </div>
                </section>

                <section aria-labelledby="upstream">
                    <h2 id="upstream" className="text-h5">
                        Open source without contributor theatre
                    </h2>
                    <p className="mt-4 text-base leading-7">
                        The repository is open so people can inspect it, keep a released version, and run their own
                        copy. It is not organised as a contributor-acquisition programme. Squirrel Labs may accept a
                        narrow fix, but unsolicited feature pull requests are not solicited and there is no review,
                        merge, support or response-time promise.
                    </p>
                </section>

                <section className="rounded-lg border-2 border-n-1 bg-primary-3 p-5">
                    <h2 className="text-h6">Looking for the product comparison?</h2>
                    <p className="mt-2 text-base leading-6">
                        The source receipts stay here. The accountless workflow and the honest Splitwise comparison stay
                        on one canonical page.
                    </p>
                    <Link
                        href="/splitwise-alternative"
                        className="mt-4 inline-flex font-semibold underline decoration-2 underline-offset-2"
                    >
                        Read the Splitwise alternative comparison
                    </Link>
                </section>
            </div>

            <SiteFooter showLocaleSwitcher={false} />
        </main>
    )
}
