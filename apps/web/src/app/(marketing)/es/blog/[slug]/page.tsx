import { articleMetadata, articlePage, articleStaticParams } from '@/lib/content-routes'

/**
 * Spanish guides. The implementation is shared across locales; this file only says which
 * language and collection it is.
 *
 * `dynamicParams = false` pins the match set to the slugs that have a es file, so an
 * untranslated article 404s here rather than being rendered on demand in the wrong language.
 */
const LOCALE = 'es' as const

export const generateStaticParams = articleStaticParams('blog', LOCALE, 'slug')
export const dynamicParams = false
export const generateMetadata = articleMetadata('blog', LOCALE, 'slug')
export default articlePage('blog', LOCALE, 'slug')
