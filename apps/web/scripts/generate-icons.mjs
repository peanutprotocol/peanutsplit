/**
 * PWA icon pipeline.
 *
 * Draws Split's mark — a thumbs-up on a black-ringed pink disc — at every size the
 * manifest, the install prompt, iOS and the browser tab need. Deterministic: re-running
 * produces byte-identical files, so it is safe to run in CI or after the artwork changes.
 *
 *   node scripts/generate-icons.mjs        (or: pnpm icons)
 *
 * Three ways to draw it, decided by whether the platform imposes a shape of its own:
 *   - "disc"  the mark as drawn, its ring touching the frame, transparent outside it. The
 *             launcher icon, the desktop PWA list, the install prompt and the browser tab
 *             all take a transparent PNG, so the icon is round rather than a circle sitting
 *             inside a square.
 *   - "flat"  for icons that get masked into a square or a squircle: Android's maskable
 *             and iOS's apple-touch, neither of which can keep a ring at the edge and
 *             neither of which wants transparency. The disc is dropped and its pink fills
 *             the tile instead, with the thumb inside the safe zone.
 *   - "mono"  the notification badge. Android throws the colours away and keeps the alpha,
 *             so the only thing that survives is the outline of the ink. Everything is
 *             drawn white, which makes the thumb one solid silhouette.
 *
 * It also writes the iOS launch screens, one per row of `src/lib/splash-screens.json`. That
 * file is shared with `src/lib/splash.ts`, which turns the same rows into the link tags.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const SOURCE = path.join(root, 'src/assets/logos/split-mark.svg')
const ICON_DIR = path.join(root, 'public/icons')
const SPLASH_DIR = path.join(ICON_DIR, 'splash')
const APP_DIR = path.join(root, 'src/app')

const PINK = '#FF90E8'
/** The manifest's `background_color`. iOS paints it while the app boots, so the splash matches. */
const CREAM = '#FAF4F0'
const BOARD = 1705 // the artwork's own coordinate space

const SPLASH_SCREENS = JSON.parse(readFileSync(path.join(root, 'src/lib/splash-screens.json'), 'utf8'))

/** Placeholder art shipped with the scaffold — replaced by this script's output. */
const STALE = ['icon-192x192.png', 'icon-512x512.png', 'icon-512x512-maskable.png']

const source = readFileSync(SOURCE, 'utf8')
/** Everything inside the root <svg>: the disc and the thumb. */
const LOGO = source.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '')
/** Just the thumbs-up, for the tiles that drop the disc. */
const MARK = source.match(/<g id="mark">([\s\S]*?)<\/g>/)[1]

/**
 * Where the thumb's ink sits in the artboard. Measured off a render of the mark alone, so
 * it includes the stroke; the drawing is not centred in its own artboard.
 */
const ART = { x: 191, y: 168, w: 1128, h: 1368 }

/**
 * `art` is the share of the frame's height the thumb takes, and applies to "flat" only.
 * The maskable number comes from the safe zone: the drawing's diagonal (1773 units) has to
 * sit inside the centre 80% circle, whichever crop the launcher picks. iOS crops far less,
 * so apple-touch can run bigger.
 */
const TARGETS = [
    { file: 'icon-192.png', dir: ICON_DIR, size: 192, mode: 'disc' },
    { file: 'icon-512.png', dir: ICON_DIR, size: 512, mode: 'disc' },
    { file: 'icon-192-maskable.png', dir: ICON_DIR, size: 192, mode: 'flat', art: 0.61 },
    { file: 'icon-512-maskable.png', dir: ICON_DIR, size: 512, mode: 'flat', art: 0.61 },
    // 180 only. iOS asks for the largest apple-touch-icon it finds and downscales it itself, and
    // the mark is a hand on a flat field — there is no hinting for 152 or 120 to preserve. Three
    // more files would be three more things to keep in step for a resample the phone already does.
    { file: 'apple-touch-icon.png', dir: ICON_DIR, size: 180, mode: 'flat', art: 0.72 },
    // The browser tab. Next serves this from the app directory, next to favicon.ico.
    { file: 'icon.png', dir: APP_DIR, size: 256, mode: 'disc' },
    // The notification badge — `NotificationOptions.badge`, read by src/app/sw.ts. Android draws
    // it at 24dp in the status bar, so it gets more of the frame than the launcher icons do.
    { file: 'badge-96.png', dir: ICON_DIR, size: 96, mode: 'mono', art: 0.82 },
]

/**
 * What goes into favicon.ico, each size rendered rather than downscaled. 16px is the one
 * place the disc loses: the ring costs two of the sixteen pixels on every side and the
 * thumb turns to soup, so that size drops the ring and keeps the hand.
 */
const ICO_SIZES = [
    { size: 16, mode: 'flat', art: 0.86 },
    { size: 32, mode: 'disc' },
    { size: 48, mode: 'disc' },
]

function svg(size, body) {
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
            `viewBox="0 0 ${BOARD} ${BOARD}" fill="none">${body}</svg>`
    )
}

/** The mark as drawn, filling the frame, transparent outside the ring. */
function disc(size) {
    return svg(size, LOGO)
}

/** The thumb on flat pink, its ink box centred and scaled to `art` of the frame's height. */
function flat(size, art) {
    const scale = (BOARD * art) / ART.h
    const tx = BOARD / 2 - scale * (ART.x + ART.w / 2)
    const ty = BOARD / 2 - scale * (ART.y + ART.h / 2)
    return svg(
        size,
        `<rect width="${BOARD}" height="${BOARD}" fill="${PINK}"/>` +
            `<g transform="translate(${tx} ${ty}) scale(${scale})">${MARK}</g>`
    )
}

/**
 * The thumb as a silhouette: white ink, nothing behind it.
 *
 * Android renders a notification badge as a mask — it keeps the alpha channel and paints every
 * opaque pixel one colour. So the black outline has to become white too, or it would read as part
 * of the shape either way and the interior would punch through it. Drawing it all white collapses
 * the outline and the fill into a single hand-shaped blob, which is what survives at 24dp.
 */
function mono(size, art) {
    const scale = (BOARD * art) / ART.h
    const tx = BOARD / 2 - scale * (ART.x + ART.w / 2)
    const ty = BOARD / 2 - scale * (ART.y + ART.h / 2)
    return svg(
        size,
        `<g transform="translate(${tx} ${ty}) scale(${scale})">${MARK.replaceAll('stroke="black"', 'stroke="white"')}</g>`
    )
}

/** The mark centred on the colour iOS shows while the app boots, at one device's pixel size. */
function splash(width, height) {
    const diameter = Math.round(Math.min(width, height) * 0.38)
    const scale = diameter / BOARD
    const body =
        `<rect width="${width}" height="${height}" fill="${CREAM}"/>` +
        `<g transform="translate(${(width - diameter) / 2} ${(height - diameter) / 2}) scale(${scale})">${LOGO}</g>`
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" fill="none">${body}</svg>`
    )
}

function draw({ size, mode, art }) {
    if (mode === 'disc') return disc(size)
    if (mode === 'mono') return mono(size, art)
    return flat(size, art)
}

function render(target) {
    return sharp(draw(target)).png({ compressionLevel: 9 }).toBuffer()
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
        await Promise.all(ICO_SIZES.map(async (entry) => ({ size: entry.size, png: await render(entry) })))
    )
    await writeFile(path.join(APP_DIR, 'favicon.ico'), ico)
    const sizes = ICO_SIZES.map((e) => e.size).join('/')
    console.log(`favicon.ico              ${sizes}px  ${(ico.length / 1024).toFixed(1)} kB`)

    // Wiped and rebuilt, so dropping a device from the table drops its file too. iOS matches a
    // launch screen on the exact geometry, and an orphan is a megabyte nobody can ever be served.
    await rm(SPLASH_DIR, { recursive: true, force: true })
    await mkdir(SPLASH_DIR, { recursive: true })
    let splashBytes = 0
    for (const screen of SPLASH_SCREENS) {
        const width = screen.width * screen.ratio
        const height = screen.height * screen.ratio
        // Four flat colours over three megapixels: a palette costs nothing here and halves the file.
        const png = await sharp(splash(width, height)).png({ compressionLevel: 9, palette: true }).toBuffer()
        await writeFile(path.join(SPLASH_DIR, `splash-${width}x${height}.png`), png)
        splashBytes += png.length
    }
    console.log(`splash/                  ${SPLASH_SCREENS.length} screens  ${(splashBytes / 1024).toFixed(1)} kB`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
