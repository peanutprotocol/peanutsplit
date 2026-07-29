import { useTranslations } from 'next-intl'
import { Title } from '@/components/ui/Title'
import { landingVariant, type LandingVariant } from '@/lib/flags'
import { HeroCreateForm } from './HeroCreateForm'
import { PassTheLinkHero } from './PassTheLinkHero'

/**
 * The former compact creator remains one build flag away as a rollback. The new default hands
 * the same real form to `PassTheLinkHero`, which adds social context without adding another
 * creation path or any illustrative network activity.
 */
function CompactHero() {
    const t = useTranslations('marketing.hero')

    return (
        <section className="relative overflow-hidden border-b border-n-1 bg-primary-1">
            <div className="mx-auto w-full max-w-2xl px-5 pb-9 pt-8 lg:py-12">
                <div>
                    {/* Title renders <p>s, which may not live inside an <h1> — the real
                        heading is the visually-hidden one beside it. */}
                    <div aria-hidden="true">
                        <Title
                            text={t('title')}
                            className="text-[3.25rem] leading-[0.9] tracking-tight lg:text-[4.5rem]"
                        />
                    </div>
                    <h1 className="sr-only">{`${t('controlTitleAccessible')} — ${t('subtitle')}`}</h1>
                    <p className="mt-3 max-w-xl text-base font-medium leading-6 text-n-1 lg:text-lg lg:leading-7">
                        {t('subtitle')}
                    </p>
                </div>

                <HeroCreateForm analyticsVariant="control" />
            </div>
        </section>
    )
}

export function Hero({ variant = landingVariant() }: { variant?: LandingVariant }) {
    return (
        <div data-testid="landing-hero-variant" data-variant={variant}>
            {variant === 'control' ? <CompactHero /> : <PassTheLinkHero />}
        </div>
    )
}

export default Hero
