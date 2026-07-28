import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher'

/**
 * The quiet half of the guardrail: Peanut appears here as a mark and nowhere else on this
 * page. Pink (#FF90E8 / secondary-1) is reserved for this mark and the Peanut settle option —
 * do not reach for it anywhere else in Split.
 *
 * This is also one of exactly two places you can change language. It belongs here because the
 * footer is the one component every page shares, including the article pages whose bodies stay
 * English — the shell around them still speaks the reader's language.
 */
export function SiteFooter({ showCompareLink = true }: { showCompareLink?: boolean }) {
    const t = useTranslations('marketing.footer')
    const tLocale = useTranslations('locale')

    return (
        <footer className="mt-auto border-t border-n-1 bg-white pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-4">
                {showCompareLink && (
                    <Link
                        href="/splitwise-alternative"
                        className="flex min-h-11 items-center px-2 text-sm text-grey-1 underline transition-opacity hover:opacity-70"
                    >
                        {t('compareLink')}
                    </Link>
                )}
                {/* The hub is the only internal link every article shares — it is how a crawler
                    that lands on any page finds the rest of them. */}
                <Link
                    href="/blog"
                    className="flex min-h-11 items-center px-2 text-sm text-grey-1 underline transition-opacity hover:opacity-70"
                >
                    {t('guidesLink')}
                </Link>
                <a
                    href="https://peanut.me?utm_source=split&utm_medium=footer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 items-center px-2 text-sm text-grey-1 transition-opacity hover:opacity-70"
                >
                    {t('poweredByPrefix')}{' '}
                    <span className="font-display font-bold text-secondary-1">{t('poweredByBrand')}</span>
                </a>
            </div>
            <div className="mx-auto w-full max-w-xl px-5 pb-5">
                <LocaleSwitcher label={tLocale('label')} className="items-center" />
            </div>
        </footer>
    )
}

export default SiteFooter
