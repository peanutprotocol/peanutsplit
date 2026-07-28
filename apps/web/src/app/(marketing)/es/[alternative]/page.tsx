import { articleMetadata, articlePage, articleStaticParams } from '@/lib/content-routes'

/**
 * Spanish comparison pages, at the root of the locale because that is the shape of the query
 * ("tricount alternative"). Safe beside the static segments: Next matches `blog`, `new`, `api`
 * and friends first, and `dynamicParams = false` pins the rest to what is on disk.
 */
const LOCALE = 'es' as const

export const generateStaticParams = articleStaticParams('alternatives', LOCALE, 'alternative')
export const dynamicParams = false
export const generateMetadata = articleMetadata('alternatives', LOCALE, 'alternative')
export default articlePage('alternatives', LOCALE, 'alternative')
