import { useTranslations } from 'next-intl'
import { Icon } from '@/components/ui/Icon'

/**
 * The current policy, stated plainly. The official service is free to use; this deliberately makes
 * no promise about its lifetime. If the policy changes, this section changes before anything else.
 */
export function HonestyStrip() {
    const t = useTranslations('marketing.honesty')
    // Literal keys, so the audit script can verify all three exist in every catalog.
    const items = [{ title: t('item1.title') }, { title: t('item2.title') }, { title: t('item3.title') }]

    return (
        <section className="mx-auto w-full max-w-xl px-5">
            <h2 className="text-h5">{t('title')}</h2>
            <ul className="mt-4 flex flex-col gap-3">
                {items.map((item) => (
                    <li key={item.title} className="flex items-start gap-3 rounded-sm border border-n-1 bg-white p-4">
                        <span
                            aria-hidden="true"
                            className="flex size-6 shrink-0 items-center justify-center rounded-full border border-n-1 bg-green-1"
                        >
                            <Icon name="check" size={14} className="text-n-1" />
                        </span>
                        <span className="flex-1">
                            <span className="block text-h7">{item.title}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    )
}

export default HonestyStrip
