import Link from 'next/link'
import type { Breadcrumb } from '@/lib/seo'

/**
 * Visible breadcrumbs. Google wants the trail rendered on the page, not only in JSON-LD, so this
 * and `breadcrumbSchema()` are fed the same array by the route — pass one list, never two.
 * The last crumb is the current page and is not a link.
 */
export function Breadcrumbs({ crumbs }: { crumbs: Breadcrumb[] }) {
    return (
        <nav aria-label="Breadcrumb" className="mx-auto w-full max-w-xl px-5 pt-6">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-grey-1">
                {crumbs.map((crumb, i) => {
                    const isLast = i === crumbs.length - 1
                    return (
                        <li key={crumb.href} className="flex items-center gap-1">
                            {i > 0 && <span aria-hidden="true">/</span>}
                            {isLast ? (
                                <span className="max-w-[220px] truncate font-medium text-n-1">{crumb.name}</span>
                            ) : (
                                <Link href={crumb.href} className="underline underline-offset-2 hover:text-n-1">
                                    {crumb.name}
                                </Link>
                            )}
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}

export default Breadcrumbs
