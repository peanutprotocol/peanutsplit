import { articleMetadata, articlePage, articleStaticParams } from '@/lib/content-routes'
import { ROOT_COLLECTIONS } from '@/lib/content'

/**
 * Portuguese pages served from a root-level slug — comparison pages and intent-capture pages, because
 * that is the shape of the query ("tricount alternative", "split a bill without an app") and a
 * folder in front of it would bury the head term.
 *
 * One dynamic segment serves both collections: Next allows a single dynamic name at a path
 * position, so `[page]` resolves the slug across `ROOT_COLLECTIONS` rather than being told which
 * collection to read. Safe beside the static segments — Next matches `blog`, `new`, `api` and
 * friends first, and `dynamicParams = false` pins the rest to what is on disk.
 */
const LOCALE = 'pt-br' as const

export const generateStaticParams = articleStaticParams(ROOT_COLLECTIONS, LOCALE, 'page')
export const dynamicParams = false
export const generateMetadata = articleMetadata(ROOT_COLLECTIONS, LOCALE, 'page')
export default articlePage(ROOT_COLLECTIONS, LOCALE, 'page')
