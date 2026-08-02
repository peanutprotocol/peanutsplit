import { useTranslations } from 'next-intl'
import { Title } from '@/components/ui/Title'
import { landingVariant, type LandingVariant } from '@/lib/flags'
import { LandingAppLink } from './LandingAppLink'
import { PassTheLinkHero } from './PassTheLinkHero'

/**
 * The rollback changes the story layout, not the route contract: both variants hand off from
 * public marketing to the app before anything can write room data.
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
                    <h1 className="sr-only">{t('controlTitleAccessible')}</h1>
                </div>

                <LandingAppLink variant="compact" />
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
