/**
 * Public SHA-256 verifier for the server-only edge marker.
 *
 * This all-zero sentinel is deliberately treated as disabled even if a preimage were supplied.
 * A separate reviewed cutover commit replaces only this public digest; the 256-bit raw marker
 * stays in GitHub/Vercel and is never configured, logged, or committed at the renderer origin.
 */
export const SPLIT_EDGE_MARKER_SHA256 = '0'.repeat(64)
