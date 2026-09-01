# Third-party notices

Peanut Split includes material that is not Squirrel Labs Ltd's. This file carries the notices those
licenses require. It must travel with any source archive or container image built from this
repository. Machine-readable per-path annotations live in [`REUSE.toml`](REUSE.toml); full license
texts live in `LICENSES/`.

## Lucide and Feather icons — ISC and MIT

The 300 expense-subject geometries in `design/doodles/parts/14-expense-subjects.json` are traced from
[Lucide](https://lucide.dev), part of which Lucide itself derives from
[Feather](https://feathericons.com). The generated module
`apps/web/src/components/ui/doodles.ts` aggregates those geometries with Squirrel Labs drawings, so
it carries all three licenses at once and its header says so.

> Copyright (c) Lucide Contributors — ISC License. See [`LICENSES/ISC.txt`](LICENSES/ISC.txt).
>
> Copyright (c) 2013-2017 Cole Bemis — MIT License. See [`LICENSES/MIT.txt`](LICENSES/MIT.txt).

The per-icon derivation list is in
[`design/doodles/LUCIDE-LICENSE.txt`](design/doodles/LUCIDE-LICENSE.txt).

## Sniglet — SIL Open Font License 1.1

`apps/web/public/fonts/sniglet-regular.ttf` and `apps/web/public/fonts/sniglet-extrabold.ttf` are
distributed under the OFL. The copyright line below is read verbatim from the fonts' own name tables.

> Copyright (c) 2008, Haley Fiege (haley@kingdomofawesome.com),
> Copyright (c) 2012, Brenda Gallo (gbrenda1987@gmail.com),
> Copyright (c) 2013, Pablo Impallari (www.impallari.com|impallari@gmail.com),
> with no Reserved Font Name.
>
> Licensed under the SIL Open Font License, Version 1.1.
> See [`LICENSES/OFL-1.1-no-RFN.txt`](LICENSES/OFL-1.1-no-RFN.txt) and <https://scripts.sil.org/OFL>.

Because there is no Reserved Font Name, a fork may rename and redistribute modified Sniglet builds,
provided the whole font stays under the OFL and the notice above is preserved.

## Gluten — SIL Open Font License 1.1

Gluten is the display face, and replaced the proprietary Knerd when this repository went public.
The browser loads three unicode-range subsets committed under `apps/web/public/fonts/gluten-*.woff2`
— by hand rather than through `next/font`, because the hero preloads the Latin subset by a stable
URL. Open Graph image rendering reads its own `.woff` copy from the pinned `@fontsource/gluten`
package, since the rasteriser cannot decode WOFF2. The copyright line below is read verbatim from
the font's upstream `OFL.txt`.

> Copyright 2020 The Gluten Project Authors (https://github.com/Etcetera-Type-Co/Gluten)
>
> Licensed under the SIL Open Font License, Version 1.1.
> See [`LICENSES/OFL-1.1-no-RFN.txt`](LICENSES/OFL-1.1-no-RFN.txt) and <https://scripts.sil.org/OFL>.

Gluten names no Reserved Font Name, so a fork may rename and redistribute modified Gluten builds,
provided the whole font stays under the OFL and the notice above is preserved.

## Roboto — Apache License 2.0

Open Graph image rendering loads Roboto from the `@fontsource` packages listed in the lockfiles, so
the image container needs no network egress. Roboto is licensed under Apache-2.0; its notice ships
with the installed package.

## Competitor names, quotations and comparisons

The comparison and alternatives pages quote and name other products. Those marks and words belong to
their owners, are used nominatively to identify the products being compared, and are **excluded from
the Squirrel Labs Ltd content grant**. Nothing here implies affiliation or endorsement. See
[`TRADEMARKS.md`](TRADEMARKS.md).

## npm dependencies and container packages

Runtime and build dependencies keep their own licenses. Every installed package and its license is
inventoried in [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) — 915 packages across both
lockfiles, regenerated with `pnpm licenses:generate` and gated by `pnpm licenses:check`, which the
test script runs so the file cannot drift from the lockfiles.

Two entries there are worth knowing about rather than looking up:

- `@img/sharp-libvips-*` is **LGPL-3.0-or-later**. It is a separate shared library that `sharp`
  links against, which is the ordinary LGPL arrangement and compatible with the AGPL grant.
- `@sentry/cli` is **FSL-1.1-MIT**, which is source-available rather than OSI open source: it
  forbids building a competing product with it, and converts to MIT two years after each release.
  It is a build-time tool for uploading source maps and is not part of the running application, but
  a self-hoster does install it. Drop it from the build if that matters to you.

The container adds Node and Alpine packages that an npm-only report does not cover. The built
service worker at `apps/web/public/sw.js` embeds dependency code directly, and is annotated in
`REUSE.toml` as an aggregate for that reason.
