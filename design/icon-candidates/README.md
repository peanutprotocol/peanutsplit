# App icon candidates — 2026-07-30

The shipped icon is the cheering mascot on brand yellow, inside a white disc, inside a
rounded square with a black border (`apps/web/scripts/generate-icons.mjs`). It has three
problems:

1. **It disappears when it gets small.** Two nested containers take the frame; the
   mascot's coloured body is 4.0% of the 512px icon's pixels. At 48px (Android launcher)
   the figure is a smudge; at 16px (browser tab) only the yellow square and the white
   circle survive.
2. **It is the parent app's mascot.** Peanut and Peanut Split sit next to each other on a
   home screen as two yellow peanuts. Nothing says which one splits a bill.
3. **It is the last vector-mascot surface.** Every UI icon moved to the hand-drawn doodle
   engine on 2026-07-28 (`ROADMAP.md`, "Doodles as icons"). The app icon did not.

## The candidates

| File | What it is | Reads at 16px |
| --- | --- | --- |
| `cand-a2-split-nohatch.png` | Doodle peanut cut at the waist, halves pulled apart, no cross-hatch, heavy stroke | yes — **recommended** |
| `cand-a-split-stroke.png` | Same cut, cross-hatch kept | 48px yes, 16px muddy |
| `cand-d-whole-doodle.png` | Whole doodle peanut, uncut | yes, but says "peanut", not "split" |
| `cand-b-split-solid.png` | Split halves filled solid | yes, but loses the drawn line |
| `cand-c-mascot-bust.png` | Today's mascot cropped to the bust, white disc dropped | no |

`strip-*.png` is the size ladder for each: 512 / 64 / 48 / 16, every step a real
downsample and then pixel-doubled, so the small end is honest.

## Regenerate

```bash
cd apps/web && node scripts/icon-candidates.mjs
```

Exploration only. `generate-icons.mjs` builds the shipped icons; when a candidate is
picked its art moves there and this folder can go.

## Fixes that hold whichever art wins

- Drop the white disc. It is a container inside a container and costs most of the frame.
- `src/app/icon.png` is a byte-identical copy of `public/icons/icon-192.png`, so the
  browser tab downscales a 192px rounded square with a border to 16px. The favicon needs
  its own art.
- `public/favicon.ico` does not exist, so `/favicon.ico` 404s — browsers probe it whatever
  the manifest says (already listed in `ROADMAP.md`).
