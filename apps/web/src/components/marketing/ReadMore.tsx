import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Icon } from '@/components/ui/Icon'

/**
 * Everything a normal app landing page carries — features, proof, who built it, FAQ — folded
 * behind one toggle, for the minority who want it.
 *
 * A plain `<details>` and not a route: it keeps one URL, it needs no JavaScript, and because
 * it is server-rendered the content is in the DOM from first paint, so the short page above it
 * does not cost the site its only body copy.
 *
 * Order is the one that was picked (features → proof → who made it → FAQ), with the join
 * preview promoted to the front. That block answers the question the sharer actually has —
 * whether they are about to inflict something on four friends who did not ask for it — and
 * four out of five people who ever meet Split arrive on a room link, never here.
 */
export function ReadMore() {
    const t = useTranslations('marketing.readMore')
    const features = ['currency', 'splits', 'exact', 'live', 'home', 'transfers'] as const
    const methods = ['cash', 'bank', 'peanut'] as const
    const team = ['konrad', 'hugo', 'natalia', 'jakub'] as const
    const points = ['built', 'free', 'data'] as const
    const questions = ['retype', 'accounts', 'currencies', 'access', 'lost', 'limits'] as const

    return (
        <section className="mx-auto w-full max-w-xl px-5">
            <details className="group">
                <summary className="shadow-4 flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm border border-n-1 bg-white p-4 [&::-webkit-details-marker]:hidden">
                    <span>
                        <span className="block text-h7">{t('toggle')}</span>
                        <span className="mt-1 block text-sm leading-5 text-grey-1">{t('toggleHint')}</span>
                    </span>
                    <Icon
                        name="chevron-down"
                        size={18}
                        aria-hidden="true"
                        className="shrink-0 transition-transform group-open:rotate-180"
                    />
                </summary>

                <div className="mt-6 flex flex-col gap-8">
                    {/* What your friends see. First, because it is the sharer's real hesitation. */}
                    <div className="rounded-sm border border-n-1 bg-primary-3 p-4">
                        <h3 className="text-h6">{t('join.title')}</h3>
                        <div className="mt-3 rounded-sm border border-n-1 bg-white p-3">
                            <p className="text-h8">🏔️ {t('join.roomName')}</p>
                            <p className="mt-2 text-sm text-grey-1">{t('join.nameLabel')}</p>
                            <p className="mt-1 rounded-sm border border-dashed border-n-1 px-2 py-1 text-sm text-grey-1">
                                {t('join.namePlaceholder')}
                            </p>
                            <p className="mt-2 text-center text-h8">{t('join.button')}</p>
                        </div>
                        <p className="mt-3 text-sm leading-5 text-n-1">{t('join.body')}</p>
                    </div>

                    <div>
                        <h3 className="text-h6">{t('features.title')}</h3>
                        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {features.map((feature) => (
                                <li key={feature} className="rounded-sm border border-n-1 bg-white p-4">
                                    <span className="block text-h7">{t(`features.${feature}.title`)}</span>
                                    <span className="mt-1 block text-sm leading-5 text-grey-1">
                                        {t(`features.${feature}.body`)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Settling, worded as you sending it. Split records the payment; it never
                        moves the money, and no line here may imply otherwise. */}
                    <div>
                        <h3 className="text-h6">{t('settle.title')}</h3>
                        <p className="mt-2 text-sm leading-5 text-grey-1">{t('settle.body')}</p>
                        <ul className="mt-3 grid grid-cols-3 gap-2">
                            {methods.map((method) => (
                                <li
                                    key={method}
                                    className="rounded-sm border border-n-1 bg-white p-3 text-center text-h8"
                                >
                                    {t(`settle.${method}`)}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* The quote band. These four built Split, and the heading says so — an
                        unlabelled first-name quote reads as a customer, which is the one thing
                        these are not. Replace with real users' words once there are some. */}
                    <div>
                        <h3 className="text-h6">{t('team.title')}</h3>
                        <p className="mt-2 text-sm leading-5 text-grey-1">{t('team.intro')}</p>
                        <ul className="mt-3 flex flex-col gap-3">
                            {team.map((member) => (
                                <li key={member} className="rounded-sm border border-n-1 bg-white p-4">
                                    <p className="text-sm leading-5 text-n-1">“{t(`team.${member}.quote`)}”</p>
                                    <p className="mt-2 text-h8">
                                        {t(`team.${member}.name`)}
                                        <span className="font-normal text-grey-1"> · {t(`team.${member}.role`)}</span>
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-h6">{t('who.title')}</h3>
                        <ul className="mt-3 flex flex-col gap-3">
                            {points.map((point) => (
                                <li
                                    key={point}
                                    className="flex items-start gap-3 rounded-sm border border-n-1 bg-white p-4"
                                >
                                    <span
                                        aria-hidden="true"
                                        className="flex size-6 shrink-0 items-center justify-center rounded-full border border-n-1 bg-green-1"
                                    >
                                        <Icon name="check" size={14} className="text-n-1" />
                                    </span>
                                    <span className="flex-1">
                                        <span className="block text-h7">{t(`who.${point}.title`)}</span>
                                        <span className="mt-1 block text-sm leading-5 text-grey-1">
                                            {t(`who.${point}.body`)}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-h6">{t('faq.title')}</h3>
                        <ul className="mt-3 flex flex-col gap-2">
                            {questions.map((question) => (
                                <li key={question} className="rounded-sm border border-n-1 bg-white">
                                    <details className="group/faq">
                                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-h8 [&::-webkit-details-marker]:hidden">
                                            {t(`faq.${question}.q`)}
                                            <Icon
                                                name="chevron-down"
                                                size={16}
                                                aria-hidden="true"
                                                className="shrink-0 transition-transform group-open/faq:rotate-180"
                                            />
                                        </summary>
                                        <p className="px-4 pb-4 text-sm leading-5 text-grey-1">
                                            {t(`faq.${question}.a`)}
                                        </p>
                                    </details>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <p className="text-sm leading-5 text-grey-1">
                        {t('compare.line')}{' '}
                        <Link href="/splitwise-alternative" className="text-n-1 underline underline-offset-2">
                            {t('compare.link')}
                        </Link>
                    </p>
                </div>
            </details>
        </section>
    )
}

export default ReadMore
