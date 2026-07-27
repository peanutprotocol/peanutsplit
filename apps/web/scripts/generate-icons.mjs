/**
 * PWA icon pipeline.
 *
 * Composites the cheering peanut onto the brand yellow and writes every icon the manifest,
 * the install prompt and iOS need. Deterministic — re-running produces byte-identical files,
 * so it is safe to run in CI or after the mascot art changes.
 *
 *   node scripts/generate-icons.mjs        (or: pnpm icons)
 *
 * Two families:
 *   - "any"      rounded square + hard black border, matching the brutalist system. What you
 *                see in the Android launcher / desktop PWA list / install prompt.
 *   - "maskable" full-bleed yellow, mascot kept inside the 80% safe circle so Android can
 *                crop it to a circle/squircle without clipping a limb.
 *
 * iOS applies its own mask to apple-touch-icon, so that one is full-bleed and un-rounded.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const SOURCE = path.join(root, 'src/assets/mascot/peanut-cheering.webp')
const OUT_DIR = path.join(root, 'public/icons')

const YELLOW = '#FFC900'
const INK = '#000000'

/** Placeholder art shipped with the scaffold — replaced by this script's output. */
const STALE = ['icon-192x192.png', 'icon-512x512.png', 'icon-512x512-maskable.png']

const TARGETS = [
    { file: 'icon-192.png', size: 192, scale: 0.72, disc: 0.4, rounded: true },
    { file: 'icon-512.png', size: 512, scale: 0.72, disc: 0.4, rounded: true },
    // Safe zone is the centre 80% (r = 0.4); everything here stays inside it.
    { file: 'icon-192-maskable.png', size: 192, scale: 0.62, disc: 0.35, rounded: false },
    { file: 'icon-512-maskable.png', size: 512, scale: 0.62, disc: 0.35, rounded: false },
    { file: 'apple-touch-icon.png', size: 180, scale: 0.7, disc: 0.39, rounded: false },
]

/** First frame of the (animated) mascot webp, fitted into a transparent square. */
async function mascot(size) {
    return sharp(SOURCE, { animated: false })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
}

function roundedRectMask(size, radius) {
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
            `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
    )
}

/** White disc behind the mascot — the peanut's shell tone is too close to #FFC900 to read on it. */
function discBackdrop(size, ratio, stroke) {
    const r = size * ratio
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
            `<circle cx="${size / 2}" cy="${size / 2}" r="${r - stroke / 2}" fill="#fff" ` +
            `stroke="${INK}" stroke-width="${stroke}"/></svg>`
    )
}

function borderOverlay(size, radius, stroke) {
    const inset = stroke / 2
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
            `<rect x="${inset}" y="${inset}" width="${size - stroke}" height="${size - stroke}" ` +
            `rx="${radius - inset}" ry="${radius - inset}" fill="none" stroke="${INK}" stroke-width="${stroke}"/></svg>`
    )
}

async function render({ size, scale, disc, rounded }) {
    const inner = Math.round(size * scale)
    const radius = Math.round(size * 0.22)
    const stroke = Math.max(2, Math.round(size * 0.025))

    const layers = [
        { input: discBackdrop(size, disc, stroke), top: 0, left: 0 },
        { input: await mascot(inner), gravity: 'centre' },
    ]
    if (rounded) layers.push({ input: borderOverlay(size, radius, stroke), top: 0, left: 0 })

    const flat = await sharp({ create: { width: size, height: size, channels: 4, background: YELLOW } })
        .composite(layers)
        .png({ compressionLevel: 9 })
        .toBuffer()

    if (!rounded) return flat

    return sharp(flat)
        .composite([{ input: roundedRectMask(size, radius), blend: 'dest-in' }])
        .png({ compressionLevel: 9 })
        .toBuffer()
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true })
    await Promise.all(STALE.map((file) => rm(path.join(OUT_DIR, file), { force: true })))

    for (const target of TARGETS) {
        const png = await render(target)
        await writeFile(path.join(OUT_DIR, target.file), png)
        console.log(`${target.file.padEnd(24)} ${target.size}px  ${(png.length / 1024).toFixed(1)} kB`)
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
