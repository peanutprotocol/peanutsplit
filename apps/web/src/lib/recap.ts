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
 * from `/r/<slug>/recap/card`, handed to `navigator.share({ files })` — and the
 * image prints the product's domain, never the slug. Nothing credential-bearing
 * leaves the group; the acquisition surface is "peanutsplit.com" printed on the
 * artwork.
 *
 * The screen at `/r/<slug>/recap` is for members who already hold the link. It
 * is `noindex`, it is not the shared artefact, and it never should be. Minting a
 * genuinely public, slug-free recap URL means minting a second, read-only,
 * revocable token — a real feature with a real surface, deliberately not V1.
 */

/** The members-only recap screen. Not shareable — see the note above. */
export const recapPath = (slug: string): string => `/r/${slug}/recap`

/**
 * The PNG, at the one URL a caller holding only a slug can build.
 *
 * A plain Route Handler (`recap/card/route.ts`), NOT the `opengraph-image`
 * segment sitting beside it, and the rule that decides this is easy to get
 * backwards — getting it backwards is what took the share button down in
 * production. Next appends a build-scoped HASH TO THE SEGMENT NAME of a
 * generated metadata image whenever any parent segment is a route group `(…)` or
 * a parallel route `@…`, and everything under `(product-shell)` qualifies. On top
 * of that it appends a `?<id>` cache-buster. So the real URL is
 * `/r/<slug>/recap/opengraph-image-<hash>?<id>`, both halves change with the
 * build, and the hashless path 404s. Nothing about it is derivable here.
 *
 * That is fine for the unfurl, which never derives anything: Next writes the
 * finished URL into the recap page's `<head>` itself, and `recapMetadata()` sets
 * no `images` precisely so it does. It is useless to `RecapShareButton`, which
 * fetches the bytes to hand to `navigator.share({ files })`, and to the WRAPPED
 * deck's `<img>`. A Route Handler's path is served exactly as written, so this
 * one stays true across builds — and it renders the same art, through
 * `server/og/recapImage.tsx`.
 */
export const recapImagePath = (slug: string): string => `/r/${slug}/recap/card`

/** Which rung of the share chain actually fired. Analytics only. */
export type RecapShareTier = 'files' | 'clipboard' | 'download'

/** No slug in the filename — it would put the credential in a Downloads folder,
 *  a screenshot of a file picker, and every "recently shared" list. */
export const RECAP_FILE_NAME = 'peanut-split-recap.png'
