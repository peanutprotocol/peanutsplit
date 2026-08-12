/** Global source-controlled kill switch. Runtime and edge configuration can never enable it. */
export const SPLIT_CONTENT_INDEX_RELEASED = false

/**
 * Exact public paths reviewed for indexing. Keeping this separate from artifact inventory lets a
 * new manifest cohort soak behind noindex without deindexing an already released guide cohort.
 */
export const SPLIT_CONTENT_INDEX_RELEASED_PATHS = [] as const satisfies readonly string[]
