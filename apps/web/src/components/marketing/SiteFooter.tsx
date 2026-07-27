import Link from 'next/link'
import { marketingCopy } from './copy'

const { footer } = marketingCopy

/**
 * The quiet half of the guardrail: Peanut appears here as a mark and nowhere else on this
 * page. Pink (#FF90E8 / secondary-1) is reserved for this mark and the Peanut settle option —
 * do not reach for it anywhere else in Split.
 */
export function SiteFooter({ showCompareLink = true }: { showCompareLink?: boolean }) {
    return (
        <footer className="mt-auto border-t border-n-1 bg-white pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto flex w-full max-w-xl items-center justify-center gap-4 px-5 py-4">
                {showCompareLink && (
                    <Link
                        href="/splitwise-alternative"
                        className="flex min-h-11 items-center px-2 text-sm text-grey-1 underline transition-opacity hover:opacity-70"
                    >
                        {footer.compareLink}
                    </Link>
                )}
                <a
                    href={footer.poweredByHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 items-center px-2 text-sm text-grey-1 transition-opacity hover:opacity-70"
                >
                    {footer.poweredByPrefix}{' '}
                    <span className="font-display font-bold text-secondary-1">{footer.poweredByBrand}</span>
                </a>
            </div>
        </footer>
    )
}

export default SiteFooter
