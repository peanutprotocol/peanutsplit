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

## Knerd — proprietary, not redistributed under this repository's license

The Knerd display faces are a purchased commercial font. Squirrel Labs Ltd holds a license to use
them in Peanut Split; that license is **not** passed on to recipients of this repository, and the
AGPL grant in `LICENSE` does not extend to these files.

Forks must hold their own Knerd license or substitute another display face. See
[`LICENSES/LicenseRef-Knerd-Commercial.txt`](LICENSES/LicenseRef-Knerd-Commercial.txt) for the
affected paths and what breaks if you simply delete them.

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

Runtime and build dependencies keep their own licenses. The exact set for any build is fixed by
`pnpm-lock.yaml` and `apps/web/pnpm-lock.yaml`; the container adds Node and Alpine packages that an
npm-only report does not cover.

Generate the per-build notice bundle before shipping an artifact:

```bash
pnpm licenses list --json > third-party-npm-licenses.json
```

The built service worker at `apps/web/public/sw.js` embeds dependency code directly; it is annotated
in `REUSE.toml` as an aggregate for that reason.
