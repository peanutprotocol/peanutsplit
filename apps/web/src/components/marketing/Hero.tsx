import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { peanutWavingHello } from '@/assets/mascot'
import { Title } from '@/components/ui/Title'
import { HeroCreateForm } from './HeroCreateForm'

/**
 * Landing hero. Full-bleed yellow band (the brand primary, so the first thing you see is
 * the colour) with the chunky two-layer Knerd headline, and then — instead of a button that
 * promises a tool — the tool. The form sits on the cream background right below the band,
 * because a yellow button on a yellow band would disappear.
 *
 * The two headline words are translated but the font is not negotiable: Knerd has a narrow
 * glyph set, so every locale's pair has to be plain unaccented capitals (SPLIT/ANYTHING,
 * DIVIDE/TODO, DIVIDA/TUDO). An accented word here renders as a gap.
 */
export function Hero() {
    const t = useTranslations('marketing.hero')
    const titleTop = t('titleTop')
    const titleBottom = t('titleBottom')

    return (
        <section>
            <div className="relative overflow-hidden border-b border-n-1 bg-primary-1">
                <div className="mx-auto w-full max-w-xl px-5 pb-8 pt-10">
                    <span className="inline-flex items-center rounded-sm border border-n-1 bg-white px-3 py-1 text-h9 uppercase tracking-wide text-n-1">
                        {t('eyebrow')}
                    </span>

                    {/* Title renders <p>s, which may not live inside an <h1> — the real heading is
                        the visually-hidden one below. */}
                    <div className="mt-5 flex flex-col items-start" aria-hidden="true">
                        <Title text={titleTop} className="text-[3.25rem] leading-[0.92] tracking-tight" />
                        <Title text={titleBottom} className="text-[3.25rem] leading-[0.92] tracking-tight" />
                    </div>
                    <h1 className="sr-only">{`${titleTop} ${titleBottom}`}</h1>

                    <div className="mt-5 flex items-end gap-3">
                        <p className="max-w-[22rem] flex-1 text-base font-medium leading-6 text-n-1">{t('subtitle')}</p>
                        <Image
                            src={peanutWavingHello}
                            alt={t('mascotAlt')}
                            priority
                            unoptimized
                            className="-mb-2 h-28 w-28 shrink-0 object-contain"
                        />
                    </div>
                </div>
            </div>

            <div className="mx-auto w-full max-w-xl px-5 pt-6">
                <HeroCreateForm />
            </div>
        </section>
    )
}

export default Hero
