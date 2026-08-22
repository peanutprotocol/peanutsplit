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
- Residue closed the same day in `9c2f083`: five truth blocks added, every blog post typed.

## 2026-08-22 — SEO low items

- Finding: this file did not exist, so §11.4 pointed at nothing. Created and seeded with the
  record above and this one.
- Finding: `/fair-split-calculator` emitted Article JSON-LD only, while the registry calculators
  emit a WebApplication node. A capture page whose head term names a calculator now emits that
  node too (`calculatorSchema`), and `/tools` lists it after the registry calculators.
- Finding: every Article and BlogPosting `image` was the 512px app icon. It is now
  `/og-default.png`, a static render of the landing card. The og routes keep the file
  convention (guide tracker decision 17).
- Finding: the footer Help, Terms and Privacy links took a 307 locale hop on peanut.me. They
  link `/en/...` directly.
