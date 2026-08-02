# SEO domain decisions — handoff

Decided 2026-07-30 (Konrad + Hugo, Discord). This supersedes any earlier assumption that content lives on split.peanut.me or peanutsplit.com.

## The rule

Content intent → `peanut.me/split/*` (subfolder on root domain).
App intent → `split.peanut.me`.
`peanutsplit.com` → landing page only.

Rationale: authority must accrue to peanut.me. Subdomains are treated by Google as quasi-separate sites, so content on split.peanut.me would NOT feed peanut.me root — only subfolders consolidate. peanutsplit.com has no authority to lose (fresh domain, exact-match domains are not a ranking factor), so demoting it to LP-only costs nothing.

## Decisions

1. **All indexable content serves on `peanut.me/split/*`.** Blog, alternatives pages, any future SEO pages. Never on split.peanut.me, never on peanutsplit.com.
2. **Serving mechanism: rewrite, not port.** peanut.me rewrites/reverse-proxies `peanut.me/split/*` to this standalone Next app (Vercel rewrites). Keeps the "add a .md, push" workflow. Do NOT port the MDX engine into peanut-ui unless the rewrite approach fails in practice.
   - Implication: this app's `metadataBase` / siteUrl env must emit `https://peanut.me` canonicals for content routes once the rewrite is live. Sitemap and robots must also be reachable/declared under the peanut.me host for those paths.
3. **App surface stays `split.peanut.me`.** App pages are noindex / low content value; reverse-proxying the app under peanut.me isn't worth the infra. Only content routes need the peanut.me host.
4. **peanutsplit.com = LP only.** Keep it for paid/social landing, app-store identity, and spin-off optionality. Any content links there 301 (or canonical) into peanut.me/split/*. It accrues nothing and that's fine.
5. **Content quality cap (hard rule).** Only curated, hand-quality pages go on peanut.me — programmatic/thin content at scale on the root domain risks sitewide quality classifiers dragging all of peanut.me. If programmatic volume is ever wanted, it goes on peanutsplit.com as a sacrificial surface. Never mix the two strategies on peanut.me.

## Current state (as of this handoff)

- Engine: standalone Next app, this repo (`apps/web`), MDX content in `src/content/` (~8 pages: blog + alternatives, en/es/pt-br).
- `metadataBase` comes from siteUrl env (`src/app/layout.tsx:17`) — domain switch is config, not code.
- The peanut.me-side rewrite is NOT yet configured. That is the keystone task: without it, canonicals pointing at peanut.me/split/* are broken links.

## Open items

- [ ] Add `peanut.me/split/*` rewrite in peanut-ui/Vercel config pointing at this app.
- [ ] Flip siteUrl/canonicals to peanut.me for content routes; verify sitemap + hreflang under the new paths.
- [ ] 301 any existing indexed peanutsplit.com content URLs to their peanut.me/split/* equivalents.
- [ ] Confirm split.peanut.me app routes are noindex.
