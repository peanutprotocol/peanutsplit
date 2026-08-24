# Rights register

This is a publication work register, not a legal conclusion. “Unresolved” means the audited tree did
not contain enough evidence; it does not mean Squirrel Labs lacks rights outside the repository.

Squirrel Labs is the intended granting entity, confirmed by the project owner on 2026-08-24.
That resolves the entity name; the file-level authority and inbound-rights evidence below still has
to be completed.

| Corpus                                            | Evidence in tree                                 | Intended treatment                                                       | Status before public release     |
| ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------- |
| Squirrel Labs-authored application code           | Git history and current source                   | Proposed AGPL-3.0-or-later                                               | Owner/assignment record required |
| Code extracted from `peanut-ui` / `peanut-api-ts` | README and historical spec name the source       | AGPL if Squirrel has authority or compatible consent                     | Unresolved                       |
| `apps/api` Fastify implementation                 | Separate app/schema; contributor history         | Decide include/separate/exclude, then clear                              | Open maintainer decision         |
| Munin-derived doodle build code                   | `design/doodles/build.py` names source           | Prove inbound terms or exclude/replace                                   | Unresolved                       |
| Lucide/Feather-derived doodles                    | Generator/provenance and existing ISC/MIT notice | Include required notices with every distribution                         | Notice propagation incomplete    |
| Sniglet fonts                                     | Font metadata/upstream OFL evidence              | Include OFL text and copyright notice                                    | Notice file missing              |
| Knerd font files                                  | Runtime references; no grant in tree             | Replace or exclude from functional public build                          | Blocker                          |
| Peanut logo/mascots/brand assets                  | Copied/runtime use; no public boundary           | Neutral defaults; separately governed official-host pack only if cleared | Blocker                          |
| Portraits and generated portrait variants         | Named likeness/source references                 | Exclude unless purpose, source rights, and consent are recorded          | Blocker                          |
| PWA/OG/favicon/background/badge assets            | Tracked binary/generated assets                  | Inventory each, prove generator/input rights, or replace/exclude         | Unresolved                       |
| Authored product content/translations             | Multiple authors and source systems              | Define documentation/content license and authority                       | Unresolved                       |
| Generated SEO content from private mono           | Manifest names private source repository         | License/provenance gate every import; remove private publisher mechanism | Blocker                          |
| Competitor quotations/screenshots/names           | Content and import/comparison surfaces           | Review quotation, nominative use, source dates, and non-affiliation      | Unresolved                       |
| Currency/static-rate data                         | Source files/runtime tables                      | Record origin, database rights analysis, and update terms                | Unresolved                       |
| Dependencies/container packages                   | Lockfiles/base image                             | Generate per-artifact SBOM and complete notices                          | Incomplete                       |

## Clearance record required

For every included path, the final internal record must state: source, author/rightsholder, inbound
terms or assignment, outbound treatment, required notice, included artifact(s), reviewer, evidence
location, and clearance date. Exclusion must be tested against a clean functional build.

A history-free repository protects private history; it does not cure ownership or notice defects.
