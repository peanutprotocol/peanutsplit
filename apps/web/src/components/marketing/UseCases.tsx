import { useTranslations } from 'next-intl'

/**
 * Four situations, one line each. Its job is recognition — people arrive looking for their own
 * case, not for "expense splitting" — and it is the only place on the page where the words trip,
 * flatmate, dinner and remote appear at all.
 *
 * The emoji are not translated. They are the illustration, not the copy, and a locale that
 * swapped them would make the four cards stop matching each other across languages.
 */
export function UseCases() {
    const t = useTranslations('marketing.uses')
    const items = [
        { emoji: '🏔️', title: t('item1.title'), body: t('item1.body') },
        { emoji: '🏠', title: t('item2.title'), body: t('item2.body') },
        { emoji: '🍕', title: t('item3.title'), body: t('item3.body') },
        { emoji: '🌍', title: t('item4.title'), body: t('item4.body') },
    ]

    return (
        <section className="mx-auto w-full max-w-xl px-5">
            <h2 className="text-h5">{t('title')}</h2>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {items.map((item) => (
                    <li key={item.emoji} className="rounded-sm border border-n-1 bg-white p-4">
                        <span aria-hidden="true" className="block text-2xl leading-none">
                            {item.emoji}
                        </span>
                        <span className="mt-2 block text-h7">{item.title}</span>
                        <span className="mt-1 block text-sm leading-5 text-grey-1">{item.body}</span>
                    </li>
                ))}
            </ul>
        </section>
    )
}

export default UseCases
