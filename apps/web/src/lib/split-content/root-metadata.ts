import type { Metadata, Viewport } from 'next'
import { contentOrigin } from './urls'

/** Explicit nulls override Next's root special-file defaults on the content document. */
export function splitContentRootMetadata(): Metadata {
    return {
        metadataBase: new URL(contentOrigin()),
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
