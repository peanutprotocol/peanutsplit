import { contentOgImage, contentOgStaticParams, ogImageExports } from '@/lib/content-og'

/** Portuguese guide unfurl. Implementation shared — see `lib/content-og`. */
const LOCALE = 'pt-br' as const

// Literal, not `ogImageExports.runtime`: Next parses this export statically and rejects
// a member expression outright.
export const runtime = 'nodejs'
export const size = ogImageExports.size
export const contentType = ogImageExports.contentType
export const alt = 'Peanut Split guide'

export const generateStaticParams = contentOgStaticParams(['blog'], LOCALE, 'slug')
export default contentOgImage(['blog'], LOCALE, 'slug')
