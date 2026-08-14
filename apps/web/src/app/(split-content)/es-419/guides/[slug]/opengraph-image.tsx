import { ogImageExports, splitGuideOgImage } from '@/lib/content-og'

/** Spanish guide unfurl. Implementation shared — see `lib/content-og`. */
const LOCALE = 'es-419' as const

// Literal, not `ogImageExports.runtime`: Next parses this export statically and rejects
// a member expression outright.
export const runtime = 'nodejs'
export const size = ogImageExports.size
export const contentType = ogImageExports.contentType
export const alt = 'Peanut Split guide'

export default splitGuideOgImage(LOCALE)
