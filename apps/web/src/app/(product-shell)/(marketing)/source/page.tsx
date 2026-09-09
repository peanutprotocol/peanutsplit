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
        title: pageTitle('Source code and self-hosting'),
        description:
            'Read the Peanut Split source code, run your own copy, and learn how Squirrel Labs maintains and funds the project.',
        path: PATH,
        type: 'website',
    })
}

const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'Source code', href: PATH },
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
                    <p className="text-h9 uppercase tracking-wide text-n-1">Source code</p>
                    <h1 className="mt-3 text-h3 leading-tight text-n-1">Peanut Split is open source</h1>
                    <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-n-1">
                        You can read the code, change it, and run your own copy. Squirrel Labs maintains the project and
                        pays for peanutsplit.com.
                    </p>
                </div>
            </header>

            <div className="mx-auto grid w-full max-w-xl gap-10 px-5 py-10 text-n-1">
                <section aria-labelledby="freedoms">
                    <h2 id="freedoms" className="text-h5">
                        License and pricing
                    </h2>
                    <div className="mt-4 grid gap-4 text-base leading-7">
                        <p>
                            Peanut Split is free to use and has no paid tier. If we can no longer afford to run
                            peanutsplit.com, we will close the service rather than charge for it.
                        </p>
                        <p>
                            The released code uses the AGPL-3.0-or-later license. You may inspect, run, modify, share
                            and self-host it under that license. Released versions keep those rights if the service
                            closes or future releases change.
                        </p>
                    </div>
                </section>

                <section aria-labelledby="code">
                    <h2 id="code" className="text-h5">
                        Code and documentation
                    </h2>
                    <p className="mt-4 text-base leading-7">The code and setup instructions are on GitHub.</p>
                    <p className="mt-3 text-base leading-7">
                        {commit
                            ? 'The source link below points to the commit used for this build.'
                            : 'This build does not report its commit. The source link points to main, which may include changes that are not live yet.'}
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
                        Run your own copy
                    </h2>
                    <p className="mt-4 text-base leading-7">
                        You need a Next.js application and a PostgreSQL database. The self-hosting guide includes a
                        Docker Compose setup to try locally. It currently supports a single application instance.
                    </p>
                    <p className="mt-3 text-base leading-7">
                        You manage the domain, HTTPS, backups, credentials, updates and monitoring. You also handle
                        privacy notices and any optional currency-rate, push, AI, analytics or error-reporting services.
                        Read the guide before deploying; it documents the setup and its limits.
                    </p>
                </section>

                <section aria-labelledby="stewardship">
                    <h2 id="stewardship" className="text-h5">
                        Maintained and paid for by Squirrel Labs
                    </h2>
                    <div className="mt-4 grid gap-4 text-base leading-7">
                        <p>
                            Squirrel Labs is the sole maintainer. It decides what to build and release, and pays every
                            project cost, including maintainer work hours, hosting, domains and third-party services.
                        </p>
                        <p>
                            On peanutsplit.com, you may see occasional links to{' '}
                            <a className={externalLink} href="https://peanut.me">
                                Peanut
                            </a>
                            , including an option to pay someone back. These links never require a click, send repeated
                            prompts, come preselected or block a feature. The license does not require them: forks and
                            self-hosted copies have no obligation to promote Peanut or Squirrel Labs.
                        </p>
                    </div>
                </section>

                <section aria-labelledby="upstream">
                    <h2 id="upstream" className="text-h5">
                        Contributing
                    </h2>
                    <p className="mt-4 text-base leading-7">
                        Squirrel Labs may accept small fixes, but is not seeking feature pull requests. Review, merging
                        and support are not guaranteed, and there is no promised response time.
                    </p>
                </section>

                <section className="rounded-lg border-2 border-n-1 bg-primary-3 p-5">
                    <h2 className="text-h6">Compare with Splitwise</h2>
                    <p className="mt-2 text-base leading-6">
                        See how the two apps handle accounts, shared expenses and repayments.
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
