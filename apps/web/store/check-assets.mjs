/**
 * Checks the store images in store/assets/ before anyone uploads them (PLAN 7.3,
 * store/screenshots.md): every expected file exists and has the exact pixel size the store asks
 * for. The screenshots and the feature graphic have no alpha channel (both stores reject
 * transparency in screenshots). The Play icon is the 32-bit PNG Play asks for: it has an alpha
 * channel, and every pixel of it is fully opaque.
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
        SCREENS.map((screen) => ({
            file: `screenshots/${set}/${screen}.jpg`,
            width,
            height,
            format: 'jpeg',
            channels: 3,
        }))
    ),
    { file: 'feature-graphic.jpg', width: 1024, height: 500, format: 'jpeg', channels: 3 },
    // Play: 512 x 512 32-bit PNG, at most 1024 KB.
    { file: 'play-icon.png', width: 512, height: 512, format: 'png', channels: 4, maxBytes: 1024 * 1024 },
]

const problems = []
for (const { file, width, height, format, channels, maxBytes } of expected) {
    const full = path.join(ASSETS, file)
    if (!existsSync(full)) {
        problems.push(`${file}: missing`)
        continue
    }
    const meta = await sharp(full).metadata()
    if (meta.format !== format) problems.push(`${file}: format ${meta.format}, expected ${format}`)
    if (meta.width !== width || meta.height !== height)
        problems.push(`${file}: ${meta.width}x${meta.height}, expected ${width}x${height}`)
    if (meta.channels !== channels) problems.push(`${file}: ${meta.channels} channels, expected ${channels}`)
    else if (channels === 4 && (await sharp(full).stats()).channels[3].min !== 255)
        problems.push(`${file}: has transparent pixels`)
    const bytes = statSync(full).size
    if (maxBytes && bytes > maxBytes) problems.push(`${file}: ${bytes} bytes, over ${maxBytes}`)
}

if (problems.length > 0) {
    console.error(`check-assets: ${problems.length} problem(s)\n${problems.map((line) => `  - ${line}`).join('\n')}`)
    process.exit(1)
}
console.log(`check-assets: ${expected.length} images ok (exact sizes; opaque, 32-bit Play icon)`)
