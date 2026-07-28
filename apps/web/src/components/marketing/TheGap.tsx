import { useTranslations } from 'next-intl'
import { Icon } from '@/components/ui/Icon'

/**
 * The argument the rest of the page rests on: every splitting app is good at the ledger and
 * nobody owns the payment. It sits directly under the rooms list, before "how it works",
 * because free-and-no-signup is no longer a reason to switch — Tricount ships both at bunq's
 * scale — and this is.
 *
 * Deliberately names no competitor. Every claim is about the shape of the problem, or is a
 * negative about Split ("never assumes"), so nothing here needs revisiting when Splitwise
 * changes its pricing. The one positive claim — that Split converts currencies for free — is
 * true of the expense drawer today.
 *
 * Keys written out one at a time rather than looped, for the reason HowItWorks gives: a literal
 * key is one `pnpm i18n:audit` can check.
 */
export function TheGap() {
    const t = useTranslations('marketing.gap')
    const items = [
        { key: '1', title: t('item1.title'), body: t('item1.body') },
        { key: '2', title: t('item2.title'), body: t('item2.body') },
        { key: '3', title: t('item3.title'), body: t('item3.body') },
    ]

    return (
        <section className="relative border-y border-n-1 bg-secondary-1 py-8">
            <div className="mx-auto w-full max-w-xl px-5">
                <h2 className="text-h5">{t('title')}</h2>
                <p className="mt-3 max-w-[30rem] text-base font-medium leading-6 text-n-1">{t('intro')}</p>

                <ul className="mt-5 flex flex-col gap-3">
                    {items.map((item) => (
                        <li
                            key={item.key}
                            className="shadow-4 flex items-start gap-3 rounded-sm border border-n-1 bg-white p-4"
                        >
                            <span
                                aria-hidden="true"
                                className="flex size-6 shrink-0 items-center justify-center rounded-full border border-n-1 bg-primary-1"
                            >
                                <Icon name="x" size={14} className="text-n-1" />
                            </span>
                            <span className="flex-1">
                                <span className="block text-h7">{item.title}</span>
                                <span className="mt-1 block text-sm leading-5 text-grey-1">{item.body}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    )
}

export default TheGap
