import { useTranslations } from 'next-intl'
import { Title } from '@/components/ui/Title'
import { HeroCreateForm } from './HeroCreateForm'

/**
 * The first fold is the real form.
 *
 * The product's useful distinction is not merely "bill splitting"; it is the handoff. One
 * person makes a room, passes its link to the group, and everyone adds their own expenses.
 * "PASS IT", the body copy, and the real URL preview inside the form communicate that loop
 * without a second, illustrative version of the product competing beside it.
 *
 * KNERD IS ONE OR TWO WORDS, NEVER MORE. The display face is all-caps, has no accented glyphs,
 * and is drawn to be looked at rather than read. Every locale's title therefore stays short and
 * unaccented. The actual promise is set below it in the
 * body face, where it can be read.
 */
export function Hero() {
    const t = useTranslations('marketing.hero')

    return (
        <section className="relative overflow-hidden border-b border-n-1 bg-primary-1">
            <div className="mx-auto w-full max-w-2xl px-5 pb-9 pt-8 lg:py-12">
                <span className="inline-flex items-center rounded-sm border border-n-1 bg-white px-3 py-1 text-h9 uppercase tracking-wide text-n-1">
                    {t('eyebrow')}
                </span>

                <div className="mt-4">
                    {/* Title renders <p>s, which may not live inside an <h1> — the real
                        heading is the visually-hidden one beside it. */}
                    <div aria-hidden="true">
                        <Title
                            text={t('title')}
                            className="text-[3.25rem] leading-[0.9] tracking-tight lg:text-[4.5rem]"
                        />
                    </div>
                    <h1 className="sr-only">{`${t('titleAccessible')} — ${t('subtitle')}`}</h1>
                    <p className="mt-3 max-w-xl text-base font-medium leading-6 text-n-1 lg:text-lg lg:leading-7">
                        {t('subtitle')}
                    </p>
                </div>

                <HeroCreateForm />
            </div>
        </section>
    )
}

export default Hero
