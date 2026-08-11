/**
 * Public SHA-256 verifier for the server-only edge marker.
 *
 * The 256-bit raw marker stays in the peanut-ui GitHub/Vercel boundary and is never configured,
 * logged, or committed at the renderer origin. Releasing this digest arms transport verification
 * without making the independently gated content indexable.
 */
export const SPLIT_EDGE_MARKER_SHA256 = '4307ae3e7601ca23faf31181ac9f268fd5c7c6c510d6ab56a49c1abb1a171dc4'
