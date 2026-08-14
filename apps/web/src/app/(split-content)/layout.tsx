import type { Metadata, Viewport } from 'next'
import { getLocale } from 'next-intl/server'
import { SplitContentDocument } from '@/components/split-content/ContentDocument'
import { asLocale } from '@/i18n/locales'
import { bodyFontClassName } from '@/lib/fonts'
import { splitContentRootMetadata, SPLIT_CONTENT_VIEWPORT } from '@/lib/split-content/root-metadata'
import '../../styles/globals.css'

// Pinned, not a default left in place: SEO_INDEXABLE is read per-request by
// splitContentIndexable() (src/lib/split-content/indexability.ts:31-33), so static/ISR would bake
// one deployment's release-gate decision into cached HTML every other box would then also serve.
// See docker-contract.test.ts for the runtime-vs-build-time contract this protects.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = splitContentRootMetadata()
export const viewport: Viewport = SPLIT_CONTENT_VIEWPORT

/**
 * A separate root document is required here: Next's root manifest/icon files outrank metadata
 * nulls, so a conditional branch in the product layout still leaked PWA tags into built content.
 */
export default async function SplitContentRootLayout({ children }: { children: React.ReactNode }) {
    const locale = asLocale(await getLocale())

    return (
        <SplitContentDocument locale={locale} bodyClassName={bodyFontClassName}>
            {children}
        </SplitContentDocument>
    )
}
