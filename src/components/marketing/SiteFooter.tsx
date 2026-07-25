import { marketingCopy } from './copy'

const { footer } = marketingCopy

/**
 * The quiet half of the guardrail: Peanut appears here as a mark and nowhere else on this
 * page. Pink (#FF90E8 / secondary-1) is reserved for this mark and the Peanut settle option —
 * do not reach for it anywhere else in Split.
 */
export function SiteFooter() {
    return (
        <footer className="mt-auto border-t border-n-1 bg-white pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto flex w-full max-w-xl items-center justify-center px-5 py-6">
                <a
                    href={footer.poweredByHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-grey-1 transition-opacity hover:opacity-70"
                >
                    {footer.poweredByPrefix}{' '}
                    <span className="font-display font-bold text-secondary-1">{footer.poweredByBrand}</span>
                </a>
            </div>
        </footer>
    )
}

export default SiteFooter
