# Licensing decision

## Current state

The current private tree is `UNLICENSED`; no root license grant has been applied. Squirrel Labs
is the intended granting entity, confirmed by the project owner on 2026-08-24, for material it has
authority to license. The repository must not be described or published as open source until the
rights register and public-release gate are complete.

## Recommended code license: `AGPL-3.0-or-later`

Peanut Split is primarily network software. AGPL is the best fit for the stated goal that modified
hosted versions keep offering their corresponding source to the people using them. It is compatible
with Squirrel Labs remaining the sole upstream maintainer and creates no duty to recruit, review, or
merge external contributors.

`-or-later` gives downstream recipients the option to use a later GNU AGPL version. That improves
long-term compatibility but delegates some future license-version choice to the Free Software
Foundation; it should be an explicit Squirrel Labs decision in the final clearance record.

## Comparison

| License           | Copyleft boundary                   | Modified network service must offer source? | Proprietary hosted fork possible?           | Sole-maintainer fit | Fit                                |
| ----------------- | ----------------------------------- | ------------------------------------------- | ------------------------------------------- | ------------------- | ---------------------------------- |
| AGPL-3.0-or-later | Strong program-level                | Yes, under AGPL section 13                  | Constrained for covered modifications       | Yes                 | Best match                         |
| GPL-3.0-or-later  | Strong on conveyed copies           | No network-use trigger                      | Yes, when operated without conveying copies | Yes                 | Misses SaaS goal                   |
| MPL-2.0           | File-level on distribution          | No                                          | Yes, especially in new adjacent files       | Yes                 | Easier mixing, weaker durability   |
| Apache-2.0        | Permissive with patent/notice terms | No                                          | Yes                                         | Yes                 | Best adoption, poorest reciprocity |

None of these licenses requires community governance or accepting patches. None should be modified
to require Peanut promotion. A custom referral/logo-retention rider would undermine standard FOSS
status and conflict with the intended downstream freedom.

## Scope and assets

A root AGPL file can only license material the granting entity controls or has compatible authority
to sublicense. It does not grant trademark, likeness, or third-party font rights. Before adding
`LICENSE` and SPDX fields:

- resolve imported Peanut/Squirrel/Munin code and contributor authority;
- replace or clear required Knerd files;
- make the default runtime functional without reserved Peanut marks/mascots;
- exclude or clear portraits and design experiments;
- include Sniglet OFL and Lucide/Feather notices with every relevant distribution;
- classify code, documentation, authored/generated content, translations, data, fonts, images, and marks.

See [RIGHTS-REGISTER.md](RIGHTS-REGISTER.md).

## Corresponding source

For an AGPL network deployment, the source offer must correspond to the version users are actually
running. A mutable `main` link can drift. The release process must embed the deployed commit, publish
an immutable source archive for it, include build/install/run material and migrations, and link that
exact source prominently from the running service.

## Safe durable promise after release

Recipients of an already published AGPL release keep the permissions granted for that version to
run, study, modify, and share it, subject to the license's terms. The license does not promise that
`peanutsplit.com` stays online or free, or that every future release has identical scope.
