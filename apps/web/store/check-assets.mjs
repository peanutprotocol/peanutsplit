/**
 * Checks the store images in store/assets/ before anyone uploads them (PLAN 7.3,
 * store/screenshots.md): every expected file exists, has the exact pixel size the store asks for
 * and has no alpha channel (both stores reject transparency in screenshots; the plan keeps the
 * feature graphic and icon opaque too).
 *
 *   node apps/web/store/check-assets.mjs     (from the repo root, or `node store/check-assets.mjs`)
 *
 * Exits 1 and lists every problem when anything is missing or wrong.
 */
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets')

const SCREENS = ['1-room', '2-add-expense', '3-receipt-scan', '4-share', '5-home']
const SETS = {
    'iphone-6.9': [1320, 2868],
    'iphone-6.3': [1206, 2622],
    'android-phone': [1080, 1920],
}

const expected = [
    ...Object.entries(SETS).flatMap(([set, [width, height]]) =>
        SCREENS.map((screen) => ({ file: `screenshots/${set}/${screen}.jpg`, width, height, format: 'jpeg' }))
    ),
    { file: 'feature-graphic.jpg', width: 1024, height: 500, format: 'jpeg' },
    // Play: 512 x 512 PNG, at most 1024 KB.
    { file: 'play-icon.png', width: 512, height: 512, format: 'png', maxBytes: 1024 * 1024 },
]

const problems = []
for (const { file, width, height, format, maxBytes } of expected) {
    const full = path.join(ASSETS, file)
    if (!existsSync(full)) {
        problems.push(`${file}: missing`)
        continue
    }
    const meta = await sharp(full).metadata()
    if (meta.format !== format) problems.push(`${file}: format ${meta.format}, expected ${format}`)
    if (meta.width !== width || meta.height !== height)
        problems.push(`${file}: ${meta.width}x${meta.height}, expected ${width}x${height}`)
    if (meta.hasAlpha || meta.channels !== 3) problems.push(`${file}: has an alpha channel (${meta.channels} channels)`)
    const bytes = statSync(full).size
    if (maxBytes && bytes > maxBytes) problems.push(`${file}: ${bytes} bytes, over ${maxBytes}`)
}

if (problems.length > 0) {
    console.error(`check-assets: ${problems.length} problem(s)\n${problems.map((line) => `  - ${line}`).join('\n')}`)
    process.exit(1)
}
console.log(`check-assets: ${expected.length} images ok (exact sizes, no alpha)`)
