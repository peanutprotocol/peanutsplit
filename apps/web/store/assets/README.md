# Store images

Made by `e2e-native/store-screenshots.spec.ts` (`STORE_SCREENSHOTS=1`, Chromium only) in three steps. It captures
the real static export against a local API server at two raw phone sizes into `store/captures/` (gitignored). It
puts each capture in `store/screenshot-frame.html` with its headline and writes the three store sizes to
`screenshots/`, plus `store/captures/contact-sheet.jpg`, one row per store size in upload order, for review. Then it
renders `store/feature-graphic.html` and resizes `resources/icon.png` to the Play icon (a 32-bit PNG, fully
opaque). Both HTML files use Roboto Flex from `@fontsource-variable/roboto-flex` in `node_modules`.

Build the export with the release default (`pnpm native:build`, so the share screen shows
`https://peanutsplit.com/r/...`), build the web app with `NEXT_PUBLIC_BASE_URL=http://localhost:3100
NEXT_PUBLIC_SPLIT_V2_ENABLED=1 NEXT_PUBLIC_FOSS_RELEASED=1 pnpm build`, migrate an empty Postgres, then run
`SPLIT_OPENROUTER_API_KEY=placeholder STORE_SCREENSHOTS=1 E2E_DATABASE_URL=<db> pnpm exec playwright test --config
playwright.native.config.ts e2e-native/store-screenshots.spec.ts --project chromium --workers=1` (the key is a
placeholder that only turns on the scan button; the spec answers the scan request itself). Check the result with
`node store/check-assets.mjs`. Konrad approves every image before upload from the contact sheet
(`store/screenshots.md`).
