# Split content audits

Record dated review and cold-read findings here (stylebook §11.4). Each recurring finding must
become a numbered rule in `stylebook.md` or a gate in `content.test.ts`, or it recurs. Newest
section last. Name the commit that closed the finding.

## 2026-08-21 — claims gate (`bf4b633`)

- Finding: §7.5 said a claim with no ID does not ship, and nothing checked it. The loader
  discarded `claims:` and `competitorClaims:`, and no comparison page carried either.
- Rule: every page declares the product-truth IDs its prose rests on. A comparison page declares
  its register rows too. `content.test.ts` fails an ID that resolves nowhere, a comparison with
  zero `competitorClaims`, and a translation whose IDs drift from its English page.
- Residue closed the next day (2026-08-22) in `9c2f083`: five truth blocks added, every blog post typed.

## 2026-08-22 — SEO low items

- Finding: this file did not exist, so §11.4 pointed at nothing. Created and seeded with the
  record above and this one.
- Finding: `/fair-split-calculator` hung off the site by one `/blog` card. A capture page whose
  head term names a calculator (`isCalculatorDoc`) is now listed on `/tools` after the registry
  calculators. It gets no WebApplication node: the page states it has no calculator, so the
  markup would contradict it (a first pass added the node; reverted 2026-08-22).
- Finding: every Article and BlogPosting `image` was the 512px app icon. It is now
  `/og-default.png`, a static render of the landing card. The og routes keep the file
  convention (guide tracker decision 17).
- Finding: the footer Help, Terms and Privacy links took a 307 locale hop on peanut.me. They
  link `/en/...` directly.

## 2026-08-22 — §11.1 never-strings ported into the native gate

- Finding: `content.test.ts` enforced about a third of §11.1. The marketing adjectives, the
  contrast frames, the transition tells, the gamification register, the UK slang and every
  es-419 and pt-br token ban were a cold read only; voseo and "plata" shipped once that way.
  The entrance cap counted "Peanut Split" alone, and the em-dash cap did not exist.
- Rule: the mono validator's rows (`scripts/split-content.mjs`, mono `16ebbf3d`) now sit in
  `NEVER_STRINGS` too, locale-scoped where the ban is. Two rows are narrower than the mono
  copy on purpose: `es-voseo` matches whole words, because "pagándole" is tuteo and a plain
  `pagá` failed it; `pt-racha` needs a determiner in front, because "racha" is also the
  você-present of `rachar`, which `localization.pt-br.md` conjugates. The entrance cap counts
  "Split by Peanut" as well; a new cap holds em-dashes to three per page.
- Residue: nine pages carried four to ten em-dashes. Each one past three became a comma, a
  full stop, a colon or a bracket pair; no sentence changed meaning. Two of those swaps had to
  avoid `: ` inside an unquoted YAML answer, which the loader reads as a mapping.
