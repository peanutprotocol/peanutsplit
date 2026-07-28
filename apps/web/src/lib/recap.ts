/**
 * Where the recap lives, and what leaves the group.
 *
 * ── The credential decision, in one place ──────────────────────────────────
 * The room slug IS the room's access control: anyone holding it can open the
 * room, join it, and add expenses. The recap screen therefore lives UNDER the
 * room (`/r/<slug>/recap`) rather than at some `/recap/<slug>` — a separate
 * top-level path would carry the exact same secret while *looking* like a public
 * page, which is the worse of the two options, not the better one.
 *
 * What that means for sharing: the recap URL is not shareable. A member posting
 * it to a feed, a story, or a public thread would be handing strangers write
 * access to the group's ledger. So V1 shares the recap as an IMAGE — the PNG
 * from `/r/<slug>/recap/opengraph-image`, handed to `navigator.share({ files })`
 * — and the image prints the product's domain, never the slug. Nothing
 * credential-bearing leaves the group; the acquisition surface is
 * "peanutsplit.com" printed on the artwork.
 *
 * The screen at `/r/<slug>/recap` is for members who already hold the link. It
 * is `noindex`, it is not the shared artefact, and it never should be. Minting a
 * genuinely public, slug-free recap URL means minting a second, read-only,
 * revocable token — a real feature with a real surface, deliberately not V1.
 */

/** The members-only recap screen. Not shareable — see the note above. */
export const recapPath = (slug: string): string => `/r/${slug}/recap`

/**
 * The PNG. Next's metadata-image convention serves `opengraph-image.tsx` at the
 * segment path; the `?<id>` it appends inside `<meta>` tags is cache-busting, so
 * the bare path is the stable one to fetch.
 */
export const recapImagePath = (slug: string): string => `/r/${slug}/recap/opengraph-image`

/** Which rung of the share chain actually fired. Analytics only. */
export type RecapShareTier = 'files' | 'clipboard' | 'download'

/** No slug in the filename — it would put the credential in a Downloads folder,
 *  a screenshot of a file picker, and every "recently shared" list. */
export const RECAP_FILE_NAME = 'peanut-split-recap.png'
