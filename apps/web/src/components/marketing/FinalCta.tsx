import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'

/**
 * The second and last ask on the page. The hero's CTA catches people who already knew what they
 * wanted; this one catches the ones who needed the four sections in between, and it names a
 * concrete occasion rather than repeating the hero's abstraction.
 *
 * Same button as the hero on purpose — a different-looking primary action at the bottom reads
 * as a different action.
 */
export function FinalCta() {
    const t = useTranslations('marketing.finalCta')

    return (
        <section className="mx-auto w-full max-w-xl px-5">
            <div className="shadow-4 rounded-sm border border-n-1 bg-white p-5">
                <h2 className="text-h5">{t('title')}</h2>
                <p className="mt-2 text-sm leading-5 text-grey-1">{t('body')}</p>
                <Link href="/new" className="mt-4 block">
                    <Button variant="primary" shadowSize="4" className="justify-center text-h6">
                        {t('button')}
                    </Button>
                </Link>
            </div>
        </section>
    )
}

export default FinalCta
