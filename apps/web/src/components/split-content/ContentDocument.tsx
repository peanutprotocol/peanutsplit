import type { ReactNode } from 'react'
import { HREFLANG, type Locale } from '@/i18n/locales'

/**
 * Root document for forwarded content. This component intentionally owns no client boundary:
 * product providers, install/PWA preflights, product schema, and translate suppression are absent
 * before the browser receives HTML.
 */
export function SplitContentDocument({
    locale,
    bodyClassName,
    children,
}: {
    locale: Locale
    bodyClassName: string
    children: ReactNode
}) {
    return (
        <html lang={HREFLANG[locale]} style={{ colorScheme: 'light' }}>
            <body className={bodyClassName}>{children}</body>
        </html>
    )
}
