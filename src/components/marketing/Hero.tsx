import Image from 'next/image'
import Link from 'next/link'
import { peanutWavingHello } from '@/assets/mascot'
import { Button } from '@/components/ui/Button'
import { Title } from '@/components/ui/Title'
import { marketingCopy } from './copy'

const { hero } = marketingCopy

/**
 * Landing hero. Full-bleed yellow band (the brand primary, so the first thing you see is
 * the colour) with the chunky two-layer Knerd headline, then the primary CTA sitting on the
 * cream background right below — a yellow button on a yellow band would disappear.
 */
export function Hero() {
    return (
        <section>
            <div className="relative overflow-hidden border-b border-n-1 bg-primary-1">
                <div className="mx-auto w-full max-w-xl px-5 pb-8 pt-10">
                    <span className="inline-flex items-center rounded-sm border border-n-1 bg-white px-3 py-1 text-h9 uppercase tracking-wide text-n-1">
                        {hero.eyebrow}
                    </span>

                    {/* Title renders <p>s, which may not live inside an <h1> — the real heading is
                        the visually-hidden one below. */}
                    <div className="mt-5 flex flex-col items-start" aria-hidden="true">
                        <Title text={hero.titleTop} className="text-[3.25rem] leading-[0.92] tracking-tight" />
                        <Title text={hero.titleBottom} className="text-[3.25rem] leading-[0.92] tracking-tight" />
                    </div>
                    <h1 className="sr-only">{`${hero.titleTop} ${hero.titleBottom}`}</h1>

                    <div className="mt-5 flex items-end gap-3">
                        <p className="max-w-[22rem] flex-1 text-base font-medium leading-6 text-n-1">{hero.subtitle}</p>
                        <Image
                            src={peanutWavingHello}
                            alt={hero.mascotAlt}
                            priority
                            unoptimized
                            className="-mb-2 h-28 w-28 shrink-0 object-contain"
                        />
                    </div>
                </div>
            </div>

            <div className="mx-auto w-full max-w-xl px-5 pt-6">
                <Link href="/new" className="block">
                    <Button variant="primary" shadowSize="4" className="justify-center text-h6">
                        {hero.cta}
                    </Button>
                </Link>
                <p className="mt-3 text-center text-sm text-grey-1">{hero.ctaHint}</p>
            </div>
        </section>
    )
}

export default Hero
