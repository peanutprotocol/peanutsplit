import { SPLIT_CONTENT_INDEX_RELEASED, SPLIT_CONTENT_INDEX_RELEASED_PATHS } from './index-release'
import { isSplitContentIndexRender } from './transport'

export interface SplitContentIndexabilityPolicy {
    runtimeValue: string | undefined
    sourceReleased: boolean
    releasedPaths: readonly string[]
    publicPath: string
    edgeReleased: boolean
}

/**
 * Indexing needs both independent release authorities for this exact path: the reviewed renderer
 * registry and the authenticated edge request bit. Runtime configuration must explicitly enable
 * that conjunction, but cannot enable either authority or expand the path set by itself.
 */
export function splitContentIndexableFor({
    runtimeValue,
    sourceReleased,
    releasedPaths,
    publicPath,
    edgeReleased,
}: SplitContentIndexabilityPolicy): boolean {
    if (!sourceReleased || !edgeReleased || !releasedPaths.includes(publicPath)) return false
    return runtimeValue === 'true'
}

export function splitContentIndexable(publicPath: string, edgeReleased: boolean): boolean {
    return splitContentIndexableFor({
        runtimeValue: process.env.SEO_INDEXABLE,
        sourceReleased: SPLIT_CONTENT_INDEX_RELEASED,
        releasedPaths: SPLIT_CONTENT_INDEX_RELEASED_PATHS,
        publicPath,
        edgeReleased,
    })
}

export function splitContentIndexableFromHeaders(headers: Headers, publicPath: string): boolean {
    return splitContentIndexable(publicPath, isSplitContentIndexRender(headers))
}

export function splitContentHasIndexablePath(edgeReleased: boolean): boolean {
    return SPLIT_CONTENT_INDEX_RELEASED_PATHS.some((publicPath) => splitContentIndexable(publicPath, edgeReleased))
}
