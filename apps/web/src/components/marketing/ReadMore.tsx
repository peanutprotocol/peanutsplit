import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Doodle } from '@/components/ui/Doodle'
import type { DoodleName } from '@/components/ui/doodles'
import { Icon } from '@/components/ui/Icon'
import { splitV2Enabled } from '@/lib/flags'

function Fold({ title, children }: { title: string; children: ReactNode }) {
    return (
        <details className="group/fold rounded-sm border border-n-1 bg-white px-4 transition-colors open:bg-primary-4/20 sm:px-5">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-4 text-h6 outline-none transition-colors focus-visible:text-n-1 sm:text-h5 [&::-webkit-details-marker]:hidden">
                <span>{title}</span>
                <Icon
                    name="plus"
                    size={24}
                    aria-hidden="true"
                    className="shrink-0 transition-transform duration-200 group-open/fold:rotate-45 motion-reduce:transition-none"
                />
            </summary>
            <div className="pb-5 pr-0 sm:pr-10">{children}</div>
        </details>
    )
}

/**
 * The deeper landing-page argument, presented as a real page fold.
 *
 * This follows peanut.me's FAQ interaction language: whole-row native
 * disclosures and a plus that turns into an x. Each fold gets the cleaner,
 * friendly rounded treatment used throughout the product while the copy
 * remains server-rendered inside `<details>`.
 */
export function ReadMore() {
    const t = useTranslations('marketing.readMore')
    const features: Array<{
        key: 'currency' | 'splits' | 'exact' | 'live' | 'offline' | 'home' | 'transfers'
        doodle: DoodleName
    }> = [
        { key: 'currency', doodle: 'globe' },
        { key: 'splits', doodle: 'slice' },
        { key: 'exact', doodle: 'tally' },
        { key: 'live', doodle: 'pulse' },
        { key: 'offline', doodle: 'tent' },
        { key: 'home', doodle: 'phone' },
        { key: 'transfers', doodle: 'swap' },
    ]
    const methods: Array<{ key: 'cash' | 'bank' | 'peanut'; doodle: DoodleName }> = [
        { key: 'cash', doodle: 'cash' },
        { key: 'bank', doodle: 'bank' },
        { key: 'peanut', doodle: 'peanut' },
    ]
    const team = [
        { key: 'konrad', portrait: '/doodles/portraits/konrad.webp' },
        { key: 'hugo', portrait: '/doodles/portraits/hugo.webp' },
    ] as const
    const points = ['built', 'free', 'data'] as const
    const questions = ['retype', 'access', 'lost', 'limits'] as const

    return (
        <section className="w-full border-y-2 border-n-1 bg-primary-3">
            <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-20">
                <div className="flex items-start justify-between gap-6">
                    <div>
                        <h2 className="text-h3 sm:text-h2">{t('toggle')}</h2>
                        <p className="mt-3 max-w-xl text-base leading-6 text-grey-1">{t('toggleHint')}</p>
                    </div>
                    <Doodle name="question" size={54} weight={1.5} className="mt-1 hidden shrink-0 sm:block" />
                </div>

                <div className="mt-10 flex flex-col gap-3">
                    <Fold title={t('join.title')}>
                        <div className="rounded-sm border border-n-1 bg-white p-4 sm:max-w-xl">
                            <p className="flex items-center gap-2 text-h8">
                                <Doodle name="mountain" size={22} weight={1.8} />
                                {t('join.roomName')}
                            </p>
                            <p className="mt-3 text-sm text-grey-1">{t('join.nameLabel')}</p>
                            <p className="mt-1 rounded-sm border border-dashed border-n-1 px-2 py-1 text-sm text-grey-1">
                                {t('join.namePlaceholder')}
                            </p>
                            <p className="mt-3 text-center text-h8">{t('join.button')}</p>
                        </div>
                        <p className="mt-4 max-w-xl text-sm leading-5 text-n-1">{t('join.body')}</p>
                    </Fold>

                    <Fold title={t('features.title')}>
                        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {features.map(({ key, doodle }) => (
                                <li key={key} className="rounded-sm border border-n-1 bg-white p-4">
                                    <Doodle name={doodle} size={25} weight={1.8} />
                                    <span className="mt-2 block text-h7">{t(`features.${key}.title`)}</span>
                                    <span className="mt-1 block text-sm leading-5 text-grey-1">
                                        {t(`features.${key}.body`)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Fold>

                    <Fold title={t('settle.title')}>
                        <p className="max-w-xl text-sm leading-5 text-grey-1">{t('settle.body')}</p>
                        <ul className="mt-4 grid grid-cols-3 gap-2">
                            {methods.map(({ key, doodle }) => (
                                <li
                                    key={key}
                                    className="flex flex-col items-center gap-2 rounded-sm border border-n-1 bg-white p-3 text-center text-h8"
                                >
                                    <Doodle name={doodle} size={25} weight={1.8} />
                                    {t(`settle.${key}`)}
                                </li>
                            ))}
                        </ul>
                    </Fold>

                    <Fold title={t('team.title')}>
                        <p className="max-w-xl text-sm leading-5 text-grey-1">{t('team.intro')}</p>
                        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                            {team.map(({ key, portrait }) => (
                                <li
                                    key={key}
                                    className="flex items-start gap-4 rounded-sm border border-n-1 bg-white p-4"
                                >
                                    <Image
                                        src={portrait}
                                        alt=""
                                        width={80}
                                        height={80}
                                        className="size-20 shrink-0 rounded-sm border border-n-1 object-cover"
                                    />
                                    <div className="min-w-0">
                                        <p className="text-sm leading-5 text-n-1">“{t(`team.${key}.quote`)}”</p>
                                        <p className="mt-2 text-h8">
                                            {t(`team.${key}.name`)}
                                            <span className="font-normal text-grey-1"> · {t(`team.${key}.role`)}</span>
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </Fold>

                    <Fold title={t('who.title')}>
                        <ul className="flex flex-col gap-3">
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
                    </Fold>

                    {questions.map((question) => (
                        <Fold key={question} title={t(`faq.${question}.q`)}>
                            <p className="max-w-xl text-sm leading-6 text-grey-1">
                                {t(`faq.${question}.a`)}
                                {/* The importer is v2-only surface: /import 404s in a v1 build,
                                    so pointing at it there would send the one reader who raised
                                    this objection to a dead page. */}
                                {question === 'retype' && splitV2Enabled() && ` ${t('faq.retype.import')}`}
                            </p>
                        </Fold>
                    ))}
                </div>

                <p className="mt-8 text-sm leading-5 text-grey-1">
                    {t('compare.line')}{' '}
                    <Link href="/splitwise-alternative" className="text-n-1 underline underline-offset-2">
                        {t('compare.link')}
                    </Link>
                </p>
            </div>
        </section>
    )
}

export default ReadMore
