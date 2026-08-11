/**
 * Where this deploy answers. Canonical tags, OG URLs and the sitemap are all resolved against
 * it, and the sitemap needs it spelled out — Next resolves `metadataBase` for metadata but not
 * for sitemap entries, and a relative <loc> makes the sitemap invalid.
 *
 * NEXT_PUBLIC_* is inlined at build time, so this is a build arg, not a runtime env var.
 */
export const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://peanutsplit.com'
