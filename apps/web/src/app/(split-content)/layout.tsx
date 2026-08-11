import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { SplitContentDocument } from '@/components/split-content/ContentDocument'
import { asLocale } from '@/i18n/locales'
import { bodyFontClassName } from '@/lib/fonts'
import { splitContentRootMetadata, SPLIT_CONTENT_VIEWPORT } from '@/lib/split-content/root-metadata'
import { isSplitContentRender } from '@/lib/split-content/transport'
import '../../styles/globals.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = splitContentRootMetadata()
export const viewport: Viewport = SPLIT_CONTENT_VIEWPORT

/**
 * A separate root document is required here: Next's root manifest/icon files outrank metadata
 * nulls, so a conditional branch in the product layout still leaked PWA tags into built content.
 */
export default async function SplitContentRootLayout({ children }: { children: React.ReactNode }) {
    if (!isSplitContentRender(await headers())) notFound()
    const locale = asLocale(await getLocale())

    return (
        <SplitContentDocument locale={locale} bodyClassName={bodyFontClassName}>
            {children}
        </SplitContentDocument>
    )
}
