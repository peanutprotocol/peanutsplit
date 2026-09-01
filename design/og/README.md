# Social card sources

`c2-hifi-hl.html` is the shipped landing card. Everything else here is exploration.

## Regenerating the card

```bash
SHELL_BIN=$(ls ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | tail -1)
"$SHELL_BIN" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1200,630 --virtual-time-budget=9000 \
  --screenshot=c2-hifi-hl@2x.png "file://$PWD/c2-hifi-hl.html"
# downsample 2400x1260 -> 1200x630, then write BOTH copies
```

The card lives in two places and they must stay byte-identical:

- `apps/web/public/og-default.png` — named by `ARTICLE_IMAGE_URL` in JSON-LD. Needs a stable URL, because Next hash-suffixes generated metadata-image routes.
- `apps/web/src/app/(product-shell)/(marketing)/opengraph-image.png` — what social scrapers fetch. Next only injects `og:image` for a file it owns inside the route segment.

`src/lib/og-card-parity.test.ts` fails if they diverge. They did diverge once, silently, and Google and Twitter showed different cards for the same page.

## Why this is a static PNG and not a BrandCard

The OG renderer is Satori, and its font pipeline ships Gluten plus a static Roboto with an explicit cmap per face and no fallback chain. This design is Roboto Flex at weight 950 with the `.pass-link-chat-frame` panel and the generated avatar art. Satori cannot draw it, so composing it there would mean approximating a design signed off on exact pixels.

The avatars in `assets/` are the real generated art, captured from the live hero at 4x and masked to circles — not redrawn.

## The exploration files carry pre-audit copy — do not reuse them

`a-split-it`, `b-pass-the-link`, `c-balance`, `d-currencies`, `c-friends*`, `c2-hifi`, `c2-hifi-plain` are earlier directions. They are kept because direction B may be worth revisiting for a campaign.

**Their copy predates the stylebook audit and would fail it.** Several carry:

- `Works offline` — banned as a category claim (`stylebook.md`, Offline row). Only expense creates are queued; editing, deleting and recording a settlement all need a connection.
- `fewest transfers` — trips `minimal-transfers` in `content.test.ts`. The exact solver is bounded at 18 non-zero balances and is greedy above it.
- `162 currencies` unqualified — reads as 162 convertible when 156 convert. Use "162 room currencies".
- `free forever` — banned (`product-truths.md#hosted-price`).

Nothing gates `design/`, so if you promote one of these, fix the copy against `src/content/_system/product-truths.md` and `stylebook.md` first.
