# Store images

Made by `e2e-native/store-screenshots.spec.ts` (`STORE_SCREENSHOTS=1`, Chromium only), which captures the real
static export against a local API server, renders `store/feature-graphic.html` and resizes `resources/icon.png` to
the Play icon. Build the export with the release default (`pnpm native:build`, so the share screen shows
`https://peanutsplit.com/r/...`), build the web app with `NEXT_PUBLIC_BASE_URL=http://localhost:3100
NEXT_PUBLIC_SPLIT_V2_ENABLED=1 NEXT_PUBLIC_FOSS_RELEASED=1 pnpm build`, migrate an empty Postgres, then run
`SPLIT_OPENROUTER_API_KEY=placeholder STORE_SCREENSHOTS=1 E2E_DATABASE_URL=<db> pnpm exec playwright test --config
playwright.native.config.ts e2e-native/store-screenshots.spec.ts --project chromium --workers=1` (the key is a
placeholder that only turns on the scan button; the spec answers the scan request itself). Check the result with
`node store/check-assets.mjs`. Konrad approves every image before upload (`store/screenshots.md`).
