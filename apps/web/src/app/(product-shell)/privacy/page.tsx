import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/marketing/Breadcrumbs'
import { JsonLd } from '@/components/marketing/JsonLd'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { FEEDBACK_RETENTION_DAYS } from '@/lib/feedback-contract'
import { GOOGLE_ADS_ID } from '@/lib/google-ads'
import { breadcrumbSchema, pageMetadata, pageTitle } from '@/lib/seo'

/**
 * Split's own privacy notice.
 *
 * It exists because Split started running an advertising tag of its own on 2026-08-24 while the
 * footer still pointed at peanut.me's policy, which describes a wallet: accounts, passkeys,
 * identity documents, payment rails. None of that is this product, and a policy that describes
 * the wrong product is worse than a missing one.
 *
 * This page sits directly under `(product-shell)`, not under `(marketing)`, so the one page that
 * describes the advertising tag is the one page that does not load it.
 *
 * Written from what the code does, not from a template. Every claim below has a file behind it:
 * the tag in `lib/google-ads.ts`, the analytics boundary in `lib/analytics.ts`, error reporting in
 * `instrumentation-client.ts`, the receipt path in `server/model.ts`, and the stored shapes in
 * `prisma/schema.prisma`. Change one of those and change this page in the same push.
 *
 * English only. `/es-419/privacy` and `/pt-br/privacy` are not routes — the same rule the rest of
 * the untranslated surface follows.
 */

const PATH = '/privacy'
const EFFECTIVE_DATE = '1 September 2026'

export function generateMetadata(): Metadata {
    return pageMetadata({
        title: pageTitle('Privacy'),
        description:
            'What Peanut Split stores, what it measures, what its advertising tag does, and how to contact Squirrel Labs Ltd about it.',
        path: PATH,
        type: 'website',
    })
}

const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'Privacy', href: PATH },
]

const externalLink = 'font-semibold text-n-1 underline decoration-2 underline-offset-2 hover:opacity-70'

export default function PrivacyPage() {
    return (
        <main className="flex min-h-dvh flex-col bg-background">
            <JsonLd data={breadcrumbSchema(crumbs)} />
            <Breadcrumbs crumbs={crumbs} />

            <header className="mt-4 border-y border-n-1 bg-primary-1">
                <div className="mx-auto w-full max-w-xl px-5 py-9">
                    <p className="text-h9 uppercase tracking-wide text-n-1">Privacy</p>
                    <h1 className="mt-3 text-h3 leading-tight text-n-1">What Split knows about you</h1>
                    <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-n-1">
                        Split has no accounts, so most of what a privacy policy usually covers does not exist here. This
                        page says what is left.
                    </p>
                    <p className="mt-3 text-sm text-n-1">Effective {EFFECTIVE_DATE}</p>
                </div>
            </header>

            <div className="mx-auto grid w-full max-w-xl gap-10 px-5 py-10 text-n-1">
                <section aria-labelledby="who">
                    <h2 id="who" className="text-h5">
                        Who runs this
                    </h2>
                    <div className="mt-4 grid gap-4 text-base leading-7">
                        <p>
                            The official service at peanutsplit.com is operated by Squirrel Labs Ltd, a company
                            registered in England and Wales (company number 14558823), registered office Office One, 1
                            Coldbath Square, Farringdon, London EC1R 5HL. Squirrel Labs is the controller of the
                            personal data described here, under UK data protection law.
                        </p>
                        <p>
                            This notice covers peanutsplit.com only. Peanut&rsquo;s wallet and card are a different
                            product with a different policy, and nothing on this page describes them. If you settle a
                            balance through a Peanut payment link, you leave Split and{' '}
                            <a className={externalLink} href="https://peanut.me/en/privacy">
                                Peanut&rsquo;s privacy policy
                            </a>{' '}
                            applies from that point.
                        </p>
                    </div>
                </section>

                <section aria-labelledby="no-account">
                    <h2 id="no-account" className="text-h5">
                        There is no account
                    </h2>
                    <div className="mt-4 grid gap-4 text-base leading-7">
                        <p>
                            Split asks for no email address, no password, no phone number and no identity document. A
                            room is a link, and holding the link is what grants access. Nobody has to prove who they are
                            to use it, and there is no profile to look you up in afterwards.
                        </p>
                        <p>
                            The room link is therefore a credential. Anyone you send it to can read and change the room,
                            and we cannot tell them apart from you.
                        </p>
                    </div>
                </section>

                <section aria-labelledby="stored">
                    <h2 id="stored" className="text-h5">
                        What the service stores
                    </h2>
                    <p className="mt-4 text-base leading-7">
                        A room and its contents are held on our servers, because everyone in the group has to see the
                        same numbers. That is:
                    </p>
                    <ul className="mt-4 grid gap-2 text-base leading-6">
                        <li>the room&rsquo;s name, currency and drawing;</li>
                        <li>the display names people type for themselves, which do not have to be real names;</li>
                        <li>each expense: its description, amount, date, who paid, and how it was split;</li>
                        <li>settlements recorded in the room, and the reactions people leave on an expense;</li>
                        <li>
                            a push subscription for each device that turns notifications on in a room &mdash; the
                            browser&rsquo;s push address, its keys, and the browser&rsquo;s user-agent string;
                        </li>
                        <li>
                            a record of edits to the room, kept so the group can see what changed rather than for us to
                            read.
                        </li>
                    </ul>
                    <p className="mt-4 text-base leading-7">
                        Whatever the group writes into a room is stored as written. An expense described &ldquo;dinner
                        with Ana&rdquo; names Ana, and there is nothing we can do about that from here &mdash; so put
                        into a room only what the group is happy for the group to read.
                    </p>
                </section>

                <section aria-labelledby="device">
                    <h2 id="device" className="text-h5">
                        What stays on your device
                    </h2>
                    <p className="mt-4 text-base leading-7">
                        Your list of recent rooms, the token that says which member of a room you are, and your app
                        settings live in your browser&rsquo;s local storage. They are not sent to us. Clearing site data
                        loses them, and a room you have no link to is a room you cannot get back.
                    </p>
                    <p className="mt-4 text-base leading-7">
                        Split itself sets four cookies. Each one is needed for the product to work. None of them
                        measures you or advertises to you.
                    </p>
                    <ul className="mt-4 grid gap-2 text-base leading-6">
                        <li>
                            <code className="text-sm">ps-locale</code> &mdash; the language you chose. One year.
                        </li>
                        <li>
                            <code className="text-sm">device-id</code> &mdash; a random value with no meaning outside
                            this site, used to keep an installed home-screen app recognised as the same anonymous device
                            rather than a new one. It is not tied to a name, an email or a room. Ten years.
                        </li>
                        <li>
                            <code className="text-sm">__Host-ps-install-handoff</code> &mdash; written only when you
                            start adding Split to an iPhone home screen. iOS copies cookies into the new app but not
                            local storage, so this random secret is the one thing that tells the new app which room you
                            were already in. The page cannot read it; only our server can. 24 hours.
                        </li>
                        <li>
                            <code className="text-sm">__Host-ps-install-handoff-ready</code> &mdash; written at the same
                            moment, and says only that a handoff is waiting. The page reads this one to know whether to
                            ask for it. 24 hours.
                        </li>
                    </ul>
                    <p className="mt-4 text-base leading-7">
                        Both handoff cookies are cleared as soon as the new app has the room.
                    </p>
                </section>

                <section aria-labelledby="analytics">
                    <h2 id="analytics" className="text-h5">
                        Measurement
                    </h2>
                    <div className="mt-4 grid gap-4 text-base leading-7">
                        <p>
                            We use PostHog to count how the product is used, on European infrastructure. It is
                            deliberately blind: automatic capture is off, session recording is off, page text is masked,
                            and no room link, member name, expense description or amount is ever attached to an event.
                            What we get is that a room was created, an expense was added, a share sheet opened &mdash;
                            not whose, and not for how much.
                        </p>
                        <p>
                            When something breaks, Sentry receives the error. Errors only: no performance tracing and no
                            session replay, and room links are stripped out of the report before it is sent.
                        </p>
                    </div>
                </section>

                <section aria-labelledby="advertising">
                    <h2 id="advertising" className="text-h5">
                        Advertising
                    </h2>
                    <div className="mt-4 grid gap-4 text-base leading-7">
                        <p>
                            Since 24 August 2026, peanutsplit.com carries a Google Ads tag (
                            <code className="text-sm">{GOOGLE_ADS_ID}</code>). It runs on this site only, and it has one
                            job: to tell Google that an ad click ended in a room being created, so we can tell which
                            adverts are worth paying for.
                        </p>
                        <p>
                            When you arrive from a Google advert, the link carries a click identifier. The tag reads it
                            and stores it in a Google cookie on this site (<code className="text-sm">_gcl_aw</code>) so
                            that a room created later in the same browser can be matched back to that click. If you did
                            not arrive from an advert, there is no click identifier to store.
                        </p>
                        <p>
                            The tag reports no page views. When a room is created it reports one event, with no value
                            attached and nothing about the room &mdash; not its link, its name, its currency or its
                            amounts. The address it reports is rebuilt before it is sent: room links are removed, and so
                            is anything else in the URL except the Google click identifiers and the campaign labels that
                            were already public in the advert.
                        </p>
                        <p>
                            Google is an independent controller of what it receives.{' '}
                            <a className={externalLink} href="https://policies.google.com/technologies/ads">
                                Google&rsquo;s advertising policy
                            </a>{' '}
                            covers that half. You can block the cookie in your browser; the product works exactly the
                            same without it.
                        </p>
                        {/* TODO(konrad): consent. The tag loads on first paint with no cookie banner. That is a
                            deliberate open question, not an oversight: PECR/EU consent for an advertising cookie is a
                            legal call, not an engineering one. Either rule that the current behaviour stands and this
                            paragraph is the notice, or say so and the tag gets gated behind a consent control before
                            the flight runs. */}
                    </div>
                </section>

                <section aria-labelledby="receipts">
                    <h2 id="receipts" className="text-h5">
                        Photographs of receipts
                    </h2>
                    <p className="mt-4 text-base leading-7">
                        If you photograph a receipt to fill in an expense, the image is sent once to a language-model
                        provider to be read, and the answer comes back as text. Split does not keep the photograph:
                        there is no column, bucket or temporary file for it, and neither the image nor anything read off
                        it is written to a log. The provider is required to be one that retains nothing and trains on
                        nothing. The feature is off entirely unless the operator has configured it.
                    </p>
                </section>

                <section aria-labelledby="sharing">
                    <h2 id="sharing" className="text-h5">
                        Who else is involved
                    </h2>
                    <p className="mt-4 text-base leading-7">
                        We do not sell personal data, and nothing here is used to build an advertising profile of you.
                        The service depends on:
                    </p>
                    <ul className="mt-4 grid gap-2 text-base leading-6">
                        <li>Google Ads &mdash; conversion measurement, as described above;</li>
                        <li>PostHog &mdash; product analytics;</li>
                        <li>Sentry &mdash; error reports;</li>
                        <li>
                            a language-model provider &mdash; receipt photographs, held for the length of one request;
                        </li>
                        <li>
                            your browser vendor&rsquo;s push service &mdash; it delivers a notification you asked for,
                            and it necessarily sees that a message was sent to your device;
                        </li>
                        <li>our hosting provider &mdash; ordinary web-server request logs, including IP addresses.</li>
                    </ul>
                    <p className="mt-4 text-base leading-7">
                        Some of these operate outside the UK. We may also disclose data where the law requires it.
                    </p>
                </section>

                <section aria-labelledby="keeping">
                    <h2 id="keeping" className="text-h5">
                        How long it is kept
                    </h2>
                    <div className="mt-4 grid gap-4 text-base leading-7">
                        <p>
                            A room is kept for as long as the service runs. The app has no way to delete a room, and
                            nothing expires one on a timer, so a room nobody has opened in a year is still there for
                            whoever still holds the link.
                        </p>
                        <p>
                            Deleting an expense or a settlement hides it rather than removing it. The row stays, with
                            its description, its amount and how it was split, because the six-second Undo needs it back
                            and the room history is a record of what changed. Nothing removes those rows later. Removing
                            a member works the same way: the person is marked former, and their name and their part of
                            past expenses stay.
                        </p>
                        {/* TODO(konrad): room deletion. There is no delete — no DELETE on /api/rooms/[slug], no
                            Room.deletedAt — and an expense or settlement delete only sets deletedAt. The paragraphs
                            above say so plainly, which is the honest thing to publish today. Whether to build real
                            deletion, and what it should erase, is a product and legal call, not an engineering one. */}
                        <p>
                            A feedback report you choose to send is deleted after {FEEDBACK_RETENTION_DAYS} days. The
                            handoff record written when you add Split to an iPhone home screen holds a room id and a
                            hashed member token. It is deleted as soon as the new app confirms it has the room. If that
                            never happens, it lasts 24 hours and is then swept.
                        </p>
                        {/* TODO(konrad): the retention period for room data. The paragraphs above are what the code
                            does, which is "kept forever". Whether that is also what we want to promise — and whether
                            dormant rooms should be swept — is a product and legal decision. */}
                    </div>
                </section>

                <section aria-labelledby="rights">
                    <h2 id="rights" className="text-h5">
                        Your rights, and the awkward part
                    </h2>
                    <div className="mt-4 grid gap-4 text-base leading-7">
                        <p>
                            Under UK data protection law you can ask for a copy of your personal data, ask us to correct
                            it, ask us to delete it, object to how we use it, or complain to the Information
                            Commissioner&rsquo;s Office at{' '}
                            <a className={externalLink} href="https://ico.org.uk">
                                ico.org.uk
                            </a>
                            . We would rather you came to us first.
                        </p>
                        <p>
                            Being accountless cuts both ways. We have no way to find &ldquo;your&rdquo; data, because
                            there is no identifier that connects you to a room from our side. To make a request about a
                            room, send us its link &mdash; that is the only thing that identifies it. Anyone else
                            holding the same link can make the same request, which is one more reason to treat it as a
                            credential.
                        </p>
                        <p>
                            Erasure is a request to us, not a button. Nothing in the app removes anything: deleting an
                            expense or a settlement hides the row and keeps it, and there is no delete for a room at
                            all. Write to the address at the end of this page, send the room link, and say what you want
                            removed. We then remove it from the database by hand.
                        </p>
                        <p>
                            Everyone in a room can already see everything in it. Removing your name or your expenses
                            changes what the rest of the group sees, so tell them rather than surprising them.
                        </p>
                    </div>
                </section>

                <section aria-labelledby="children">
                    <h2 id="children" className="text-h5">
                        Children
                    </h2>
                    <p className="mt-4 text-base leading-7">
                        Split is not intended for anyone under 18, and we do not knowingly collect data about children.
                        Contact us if you believe we have.
                    </p>
                </section>

                <section aria-labelledby="contact">
                    <h2 id="contact" className="text-h5">
                        Contact
                    </h2>
                    <ul className="mt-4 grid gap-2 text-base leading-6">
                        <li>
                            Email:{' '}
                            <a className={externalLink} href="mailto:support@peanut.me">
                                support@peanut.me
                            </a>
                        </li>
                        <li>Post: Squirrel Labs Ltd, Office One, 1 Coldbath Square, Farringdon, London EC1R 5HL</li>
                    </ul>
                    <p className="mt-4 text-base leading-7">
                        If this page changes we will change the date at the top. This notice is written in English; a
                        translation, if one is ever published, does not override it.
                    </p>
                </section>
            </div>

            <SiteFooter showLocaleSwitcher={false} />
        </main>
    )
}
