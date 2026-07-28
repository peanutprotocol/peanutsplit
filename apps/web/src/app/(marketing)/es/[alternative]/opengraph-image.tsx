import { contentOgImage, contentOgStaticParams, ogImageExports } from '@/lib/content-og'

/** Spanish comparison unfurl. Implementation shared — see `lib/content-og`. */
const LOCALE = 'es' as const

// Literal, not `ogImageExports.runtime`: Next parses this export statically and rejects
// a member expression outright.
export const runtime = 'nodejs'
export const size = ogImageExports.size
export const contentType = ogImageExports.contentType
export const alt = 'Peanut Split'

export const generateStaticParams = contentOgStaticParams('alternatives', LOCALE, 'alternative')
export default contentOgImage('alternatives', LOCALE, 'alternative')
