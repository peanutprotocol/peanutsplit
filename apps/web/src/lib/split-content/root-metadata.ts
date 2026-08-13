import type { Metadata, Viewport } from 'next'
import { CANONICAL_ORIGIN } from '@/lib/domains'

/** Explicit nulls override Next's root special-file defaults on the content document. */
export function splitContentRootMetadata(): Metadata {
    return {
        metadataBase: new URL(CANONICAL_ORIGIN),
        applicationName: null,
        appleWebApp: null,
        icons: null,
        manifest: null,
    }
}

export const SPLIT_CONTENT_VIEWPORT: Viewport = {
    width: 'device-width',
    initialScale: 1,
    colorScheme: 'light',
}
