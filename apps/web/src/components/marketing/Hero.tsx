import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { peanutWavingHello } from '@/assets/mascot'
import { Title } from '@/components/ui/Title'
import { HeroCreateForm } from './HeroCreateForm'

/**
 * The first fold IS the form.
 *
 * There used to be a yellow pitch band up here — headline, mascot, subtitle — with the tool
 * below it on cream. That ordering asks somebody to read a claim before they are allowed to
 * test it, on a page whose entire argument is that testing it takes four seconds. The band
 * stayed; the form moved into it. The yellow is now the frame around the thing you came to
 * use, not a poster hung above it.
 *
 * The form sits on white with a deep shadow so it lifts off the yellow, and its submit button
 * is black — the app's yellow CTA would vanish here, which is the whole reason the old layout
 * kept the two apart.
 *
 * KNERD IS ONE OR TWO WORDS, NEVER MORE. The display face is all-caps, has no accented glyphs,
 * and is drawn to be looked at rather than read; past two words it stops being a headline and
 * becomes a texture. So every locale's word has to be short AND unaccented (SPLIT IT, DIVIDIR,
 * RACHAR) — an accented character renders as a gap. The actual promise is set below it in the
 * body face, where it can be read.
 */
export function Hero() {
    const t = useTranslations('marketing.hero')

    return (
        <section className="relative overflow-hidden border-b border-n-1 bg-primary-1">
            <div className="mx-auto w-full max-w-xl px-5 pb-8 pt-7">
                <span className="inline-flex items-center rounded-sm border border-n-1 bg-white px-3 py-1 text-h9 uppercase tracking-wide text-n-1">
                    {t('eyebrow')}
                </span>

                <div className="mt-4 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                        {/* Title renders <p>s, which may not live inside an <h1> — the real
                            heading is the visually-hidden one beside it. */}
                        <div aria-hidden="true">
                            <Title text={t('title')} className="text-[3.25rem] leading-[0.9] tracking-tight" />
                        </div>
                        <h1 className="sr-only">{`${t('title')} — ${t('subtitle')}`}</h1>
                        <p className="mt-3 text-base font-medium leading-6 text-n-1">{t('subtitle')}</p>
                    </div>
                    <Image
                        src={peanutWavingHello}
                        alt={t('mascotAlt')}
                        priority
                        unoptimized
                        className="-mb-1 h-20 w-20 shrink-0 object-contain"
                    />
                </div>

                <HeroCreateForm />
            </div>
        </section>
    )
}

export default Hero
