/**
 * Store-app icons and splash, drawn from the same artwork and geometry as the PWA icons
 * (scripts/generate-icons.mjs), so the app icon matches the installed PWA's.
 *
 *   cd apps/web && node resources/render-native-assets.mjs
 *
 * Run it only when the artwork changes, then commit what it writes (ARCHITECTURE 9.6: generated
 * once, never in CI). It writes:
 *   - resources/icon.png     1024 px, no alpha: the PWA apple-touch tile (thumb on flat pink).
 *                            The App Store rejects an icon with an alpha channel.
 *   - resources/splash.png   2732 px, no alpha: the mark on the first-paint cream, sized like the
 *                            PWA launch screens once iOS crops the square to a phone screen.
 *   - android/.../drawable-<density>/ic_stat_split.png: the white mono mark (the PWA
 *                            notification badge). Android draws only its alpha; without it a push
 *                            shows a grey square.
 * and then runs @capacitor/assets 3.0.5 to write the iOS app icon and splash and the Android
 * launcher icons (adaptive: the PWA maskable thumb on pink) and splash screens. The tool reads
 * `icon.png` as a logo and would draw it small on a plain background, so it gets its own input
 * names in a temporary folder.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const RESOURCES = path.join(root, 'resources')
const ANDROID_RES = path.join(root, 'android/app/src/main/res')

// The same values as scripts/generate-icons.mjs: artwork, colours and the thumb's ink box.
const SOURCE = readFileSync(path.join(root, 'src/assets/logos/split-mark.svg'), 'utf8')
const LOGO = SOURCE.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '')
const MARK = SOURCE.match(/<g id="mark">([\s\S]*?)<\/g>/)[1]
const PINK = '#FF90E8'
const CREAM = '#FAF4F0'
const BOARD = 1705
const ART = { x: 191, y: 168, w: 1128, h: 1368 }

function svg(size, body) {
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
            `viewBox="0 0 ${BOARD} ${BOARD}" fill="none">${body}</svg>`
    )
}

/** The thumb's ink box centred and scaled to `art` of the frame's height. */
function thumb(art, mark = MARK) {
    const scale = (BOARD * art) / ART.h
    const tx = BOARD / 2 - scale * (ART.x + ART.w / 2)
    const ty = BOARD / 2 - scale * (ART.y + ART.h / 2)
    return `<g transform="translate(${tx} ${ty}) scale(${scale})">${mark}</g>`
}

const pinkTile = `<rect width="${BOARD}" height="${BOARD}" fill="${PINK}"/>`

/** An opaque PNG (colour type 2): flattened onto `background`, alpha channel dropped. */
function opaque(input, background) {
    return sharp(input).flatten({ background }).removeAlpha().png({ compressionLevel: 9 }).toBuffer()
}

// The PWA phone launch screens draw the disc at 38% of the screen width. iOS fills a phone screen
// with this square by its height (about 2.2 x the width), so 38% of the width is about 17.5% here.
const SPLASH = 2732
const SPLASH_DISC = 0.175

function splashSvg() {
    const diameter = Math.round(SPLASH * SPLASH_DISC)
    const offset = (SPLASH - diameter) / 2
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${SPLASH}" height="${SPLASH}" fill="none">` +
            `<rect width="${SPLASH}" height="${SPLASH}" fill="${CREAM}"/>` +
            `<g transform="translate(${offset} ${offset}) scale(${diameter / BOARD})">${LOGO}</g></svg>`
    )
}

/** Status-bar icon sizes: 24 dp at each density. */
const STAT_DENSITIES = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 }

async function main() {
    const icon = await opaque(svg(1024, pinkTile + thumb(0.72)), PINK)
    const splash = await opaque(splashSvg(), CREAM)
    writeFileSync(path.join(RESOURCES, 'icon.png'), icon)
    writeFileSync(path.join(RESOURCES, 'splash.png'), splash)

    const white = MARK.replaceAll('stroke="black"', 'stroke="white"')
    for (const [density, size] of Object.entries(STAT_DENSITIES)) {
        const dir = path.join(ANDROID_RES, `drawable-${density}`)
        mkdirSync(dir, { recursive: true })
        const png = await sharp(svg(size, thumb(0.82, white))).png({ compressionLevel: 9 }).toBuffer()
        writeFileSync(path.join(dir, 'ic_stat_split.png'), png)
    }

    const inputs = mkdtempSync(path.join(tmpdir(), 'split-assets-'))
    try {
        copyFileSync(path.join(RESOURCES, 'icon.png'), path.join(inputs, 'icon-only.png'))
        copyFileSync(path.join(RESOURCES, 'splash.png'), path.join(inputs, 'splash.png'))
        // Adaptive layers: the PWA maskable geometry (thumb at 61%) survives every launcher mask.
        writeFileSync(path.join(inputs, 'icon-foreground.png'), await sharp(svg(1024, thumb(0.61))).png().toBuffer())
        writeFileSync(path.join(inputs, 'icon-background.png'), await opaque(svg(1024, pinkTile), PINK))
        execFileSync(
            'pnpm',
            [
                'dlx',
                '--allow-build=sharp',
                '@capacitor/assets@3.0.5',
                'generate',
                '--ios',
                '--android',
                '--assetPath',
                path.relative(root, inputs),
            ],
            { cwd: root, stdio: 'inherit' }
        )
    } finally {
        rmSync(inputs, { recursive: true, force: true })
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
