import { SPLIT_CONTENT_INDEX_RELEASED, SPLIT_CONTENT_INDEX_RELEASED_PATHS } from './index-release'

export interface SplitContentIndexabilityPolicy {
    runtimeValue: string | undefined
    sourceReleased: boolean
    releasedPaths: readonly string[]
    publicPath: string
}

/**
 * Two authorities, both required.
 *
 * The source registry — reviewed in git — names the exact public paths cleared for indexing and
 * carries a one-line global stop. The runtime flag (`SEO_INDEXABLE`) decides whether THIS
 * deployment is the one allowed to advertise them, which is what keeps CI and any other box
 * serving the same commit dark.
 *
 * Runtime can only ever subtract: it cannot release a path the registry does not name, and it
 * cannot widen the set.
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
