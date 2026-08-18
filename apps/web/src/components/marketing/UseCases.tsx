import { useTranslations } from 'next-intl'
import { Doodle } from '@/components/ui/Doodle'
import type { DoodleName } from '@/components/ui/doodles'

/**
 * Four situations, one line each. Its job is recognition — people arrive looking for their own
 * case, not for "expense splitting" — and it is the only place on the page where the words trip,
 * flatmate, dinner and remote appear at all.
 *
 * The drawings are not translated. They are the illustration, not the copy, and a locale that
 * swapped them would make the four cards stop matching each other across languages.
 */
export function UseCases() {
    const t = useTranslations('marketing.uses')
    const items: Array<{ doodle: DoodleName; title: string }> = [
        { doodle: 'mountain', title: t('item1.title') },
        { doodle: 'house', title: t('item2.title') },
        { doodle: 'pizza', title: t('item3.title') },
        { doodle: 'globe', title: t('item4.title') },
    ]

    return (
        <section className="mx-auto w-full max-w-xl px-5">
            <h2 className="text-h5">{t('title')}</h2>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {items.map((item) => (
                    <li key={item.doodle} className="rounded-sm border border-n-1 bg-white p-4">
                        <Doodle name={item.doodle} size={30} weight={1.8} />
                        <span className="mt-2 block text-h7">{item.title}</span>
                    </li>
                ))}
            </ul>
        </section>
    )
}

export default UseCases
