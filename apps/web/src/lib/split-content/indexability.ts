import { SPLIT_CONTENT_INDEX_RELEASED, SPLIT_CONTENT_INDEX_RELEASED_PATHS } from './index-release'

export interface SplitContentIndexabilityPolicy {
    runtimeValue: string | undefined
    sourceReleased: boolean
    releasedPaths: readonly string[]
    publicPath: string
}

/**
 * Indexing needs the reviewed renderer registry to name this exact path. Runtime configuration
 * must explicitly enable that, but cannot release a path or expand the path set by itself.
 */
export function splitContentIndexableFor({
    runtimeValue,
    sourceReleased,
    releasedPaths,
    publicPath,
}: SplitContentIndexabilityPolicy): boolean {
    if (!sourceReleased || !releasedPaths.includes(publicPath)) return false
    return runtimeValue === 'true'
}

export function splitContentIndexable(publicPath: string): boolean {
    return splitContentIndexableFor({
        runtimeValue: process.env.SEO_INDEXABLE,
        sourceReleased: SPLIT_CONTENT_INDEX_RELEASED,
        releasedPaths: SPLIT_CONTENT_INDEX_RELEASED_PATHS,
        publicPath,
    })
}
