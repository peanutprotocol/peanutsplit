/**
 * PWA icon pipeline.
 *
 * Draws Split's mark — a thumbs-up on a pink disc — at every size the manifest, the
 * install prompt, iOS and the browser tab need. Deterministic: re-running produces
 * byte-identical files, so it is safe to run in CI or after the artwork changes.
 *
 *   node scripts/generate-icons.mjs        (or: pnpm icons)
 *
 * The disc is not drawn. It is the tile — the icon is filled with the disc's pink and the
 * thumbs-up sits on it, so the artwork never becomes a circle inside a square.
 * Three families:
 *   - "any"      rounded square + hard black border, matching the brutalist system. What
 *                you see in the Android launcher / desktop PWA list / install prompt.
 *   - "maskable" full-bleed, thumb kept inside the 80% safe circle so Android can crop to
 *                a circle or a squircle without taking a finger off.
 *   - "favicon"  no border, artwork close to the edge, and every .ico size rendered on its
 *                own rather than downscaled — at 16px there is nothing to spare.
 * iOS applies its own mask to apple-touch-icon, so that one is full-bleed and un-rounded.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const SOURCE = path.join(root, 'src/assets/logos/split-mark.svg')
const ICON_DIR = path.join(root, 'public/icons')
const APP_DIR = path.join(root, 'src/app')

const PINK = '#FF90E8'
const INK = '#000000'

/** Placeholder art shipped with the scaffold — replaced by this script's output. */
const STALE = ['icon-192x192.png', 'icon-512x512.png', 'icon-512x512-maskable.png']

/** Just the thumbs-up, without the disc behind it. */
const MARK = readFileSync(SOURCE, 'utf8').match(/<g id="mark">([\s\S]*?)<\/g>/)[1]

/**
 * Where the thumb's ink sits in the 1705-unit artboard. Measured off a render of the mark
 * alone, so it includes the stroke; the drawing is not centred in its own artboard.
 */
const ART = { x: 191, y: 168, w: 1128, h: 1368 }

/**
 * `art` is the share of the frame's height the thumb takes. The maskable number comes from
 * the safe zone: the drawing's diagonal (1773 units) has to sit inside the centre 80%
 * circle, whichever crop the launcher picks.
 */
const TARGETS = [
    { file: 'icon-192.png', dir: ICON_DIR, size: 192, art: 0.74, rounded: true },
    { file: 'icon-512.png', dir: ICON_DIR, size: 512, art: 0.74, rounded: true },
    { file: 'icon-192-maskable.png', dir: ICON_DIR, size: 192, art: 0.61 },
    { file: 'icon-512-maskable.png', dir: ICON_DIR, size: 512, art: 0.61 },
    { file: 'apple-touch-icon.png', dir: ICON_DIR, size: 180, art: 0.72 },
    // The browser tab. Next serves this from the app directory, next to favicon.ico.
    { file: 'icon.png', dir: APP_DIR, size: 256, art: 0.86 },
]

/** Sizes packed into favicon.ico. */
const ICO_SIZES = [16, 32, 48]
const ICO_ART = 0.86

function roundedRectMask(size, radius) {
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
            `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
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

/** The thumb on pink, its ink box centred and scaled to `art` of the frame's height. */
async function render({ size, art, rounded = false }) {
    const scale = (size * art) / ART.h
    const tx = size / 2 - scale * (ART.x + ART.w / 2)
    const ty = size / 2 - scale * (ART.y + ART.h / 2)
    const radius = Math.round(size * 0.22)
    const stroke = Math.max(2, Math.round(size * 0.025))

    const art2x = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="none">` +
            `<rect width="${size}" height="${size}" fill="${PINK}"/>` +
            `<g transform="translate(${tx} ${ty}) scale(${scale})">${MARK}</g></svg>`
    )

    const flat = await sharp(art2x).png().toBuffer()
    if (!rounded) return sharp(flat).png({ compressionLevel: 9 }).toBuffer()

    return sharp(flat)
        .composite([
            { input: borderOverlay(size, radius, stroke), top: 0, left: 0 },
            { input: roundedRectMask(size, radius), blend: 'dest-in' },
        ])
        .png({ compressionLevel: 9 })
        .toBuffer()
}

/** Minimal ICO container: a directory of PNG-encoded images, which every live browser reads. */
function packIco(images) {
    const header = Buffer.alloc(6)
    header.writeUInt16LE(0, 0) // reserved
    header.writeUInt16LE(1, 2) // type: icon
    header.writeUInt16LE(images.length, 4)

    let offset = 6 + images.length * 16
    const entries = images.map(({ size, png }) => {
        const entry = Buffer.alloc(16)
        entry.writeUInt8(size < 256 ? size : 0, 0) // 0 means 256
        entry.writeUInt8(size < 256 ? size : 0, 1)
        entry.writeUInt8(0, 2) // palette size: none
        entry.writeUInt8(0, 3) // reserved
        entry.writeUInt16LE(1, 4) // colour planes
        entry.writeUInt16LE(32, 6) // bits per pixel
        entry.writeUInt32LE(png.length, 8)
        entry.writeUInt32LE(offset, 12)
        offset += png.length
        return entry
    })

    return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

async function main() {
    await mkdir(ICON_DIR, { recursive: true })
    await Promise.all(STALE.map((file) => rm(path.join(ICON_DIR, file), { force: true })))

    for (const target of TARGETS) {
        const png = await render(target)
        await writeFile(path.join(target.dir, target.file), png)
        console.log(`${target.file.padEnd(24)} ${target.size}px  ${(png.length / 1024).toFixed(1)} kB`)
    }

    const ico = packIco(
        await Promise.all(ICO_SIZES.map(async (size) => ({ size, png: await render({ size, art: ICO_ART }) })))
    )
    await writeFile(path.join(APP_DIR, 'favicon.ico'), ico)
    console.log(`favicon.ico              ${ICO_SIZES.join('/')}px  ${(ico.length / 1024).toFixed(1)} kB`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
