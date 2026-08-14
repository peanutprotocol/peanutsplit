import Image from 'next/image'
import { useTranslations } from 'next-intl'
import handThumbsUp from '@/assets/illustrations/hand-thumbs-up.svg'

/**
 * The claim strip, in peanut.me's house style: bold uppercase words scrolling past a waving
 * thumbs-up, hard rules top and bottom. It replaces a static four-column grid of milestones
 * ("ROOM CREATED", "LINK SHARED") which described the demo above it rather than saying anything
 * about the product.
 *
 * Pure CSS, no marquee library: one track holding the run twice, translated by half its width.
 * The duplicate is `aria-hidden` so the claims are announced once, and both the OS
 * reduced-motion query and the in-app animations switch stop the track in `globals.css`.
 */
export function LandingMarquee() {
    const t = useTranslations('marketing.proof.rail')
    // Literal keys, so the i18n audit can verify all six exist in every catalog.
    const claims = [t('free'), t('noSignup'), t('oneLink'), t('anyCurrency'), t('noMath'), t('even')]

    return (
        <div className="landing-marquee" data-testid="landing-marquee">
            <div className="landing-marquee-track">
                {[0, 1].map((run) => (
                    <ul key={run} className="landing-marquee-run" aria-hidden={run === 1 || undefined}>
                        {claims.map((claim) => (
                            <li key={claim}>
                                {claim}
                                <Image src={handThumbsUp} alt="" aria-hidden="true" />
                            </li>
                        ))}
                    </ul>
                ))}
            </div>
        </div>
    )
}

export default LandingMarquee
