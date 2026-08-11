/**
 * Where the product app answers. Product metadata and schema resolve against it. Unmigrated
 * marketing canonicals/discovery remain on peanutsplit.com in `seo.ts` until each page moves;
 * new Split content uses CONTENT_ORIGIN through its own URL builders.
 *
 * NEXT_PUBLIC_* is inlined at build time, so this is a build arg, not a runtime env var.
 */
export const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://peanutsplit.com'
