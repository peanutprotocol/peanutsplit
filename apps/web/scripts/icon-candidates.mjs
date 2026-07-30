/**
 * Renders the app-icon candidates that the 2026-07-30 icon review compares, plus a
 * size ladder for each (512 / 64 / 48 / 16, pixel-doubled so the small ones are readable).
 *
 *   cd apps/web && node scripts/icon-candidates.mjs
 *
 * Exploration only — `generate-icons.mjs` is what builds the shipped icons. When a
 * candidate is picked, its art moves into that script and this one can go.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const OUT = '../../design/icon-candidates'
mkdirSync(OUT, { recursive: true })
const YELLOW = '#FFC900'
const INK = '#000000'

const src = readFileSync('src/components/ui/doodles.ts', 'utf8')
const PEANUT = src.match(/\bpeanut:\s*'([^']+)'/)[1]
// The shell outline is the first subpath; the rest are the cross-hatch marks.
const SUBS = PEANUT.split(/(?=M)/).filter(Boolean)
const SHELL = SUBS[0]
const HATCH = SUBS.slice(1).join(' ')

// Peanut long axis runs lower-left -> upper-right; waist sits near (15.5, 16.8).
const CX = 15.5
const CY = 16.8
const CUT_DEG = 42.3 // perpendicular to the long axis
const AX = 0.673 // unit vector along the long axis
const AY = -0.74

/** Split the drawing at the waist and push the two halves apart by `gap` units. */
function splitHalves({ gap, stroke, fill, plain = false }) {
    const style = fill
        ? `fill="${INK}" stroke="${INK}" stroke-width="${stroke}" stroke-linejoin="round"`
        : `fill="none" stroke="${INK}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"`
    const body =
        fill || plain ? `<path d="${SHELL}" ${style}/>` : `<path d="${SHELL} ${HATCH}" ${style}/>`
    const half = (sign, id) => `
      <clipPath id="${id}" clipPathUnits="userSpaceOnUse">
        <rect x="${CX - 40}" y="${sign > 0 ? CY - 40 : CY}" width="80" height="40"
              transform="rotate(${CUT_DEG} ${CX} ${CY})"/>
      </clipPath>
      <g clip-path="url(#${id})" transform="translate(${sign * AX * gap} ${sign * AY * gap})">${body}</g>`
    return half(1, 'a') + half(-1, 'b')
}

/** 512px icon: art in a 32-unit box, scaled to `scale` of the frame, on flat yellow. */
async function frame(inner, { scale = 0.78, bg = YELLOW } = {}) {
    const size = 512
    const box = size * scale
    const off = (size - box) / 2
    const svg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
            `<rect width="${size}" height="${size}" fill="${bg}"/>` +
            `<g transform="translate(${off} ${off}) scale(${box / 32})">${inner}</g></svg>`
    )
    return sharp(svg).png({ compressionLevel: 9 }).toBuffer()
}

/** Mascot cropped to the bust, bleeding to the frame edge, no white disc. */
async function mascotBust() {
    const size = 512
    const big = await sharp('src/assets/mascot/peanut-cheering.webp', { animated: false })
        .resize(900, 900, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    const art = await sharp(big)
        .extract({ left: 150, top: 130, width: 600, height: 600 })
        .resize(size, size)
        .png()
        .toBuffer()
    return sharp({ create: { width: size, height: size, channels: 4, background: YELLOW } })
        .composite([{ input: art, gravity: 'centre' }])
        .png()
        .toBuffer()
}

const CANDIDATES = {
    'cand-a-split-stroke': () => frame(splitHalves({ gap: 3, stroke: 2.6, fill: false }), { scale: 0.86 }),
    'cand-a2-split-nohatch': () =>
        frame(splitHalves({ gap: 3, stroke: 2.9, fill: false, plain: true }), { scale: 0.86 }),
    'cand-b-split-solid': () => frame(splitHalves({ gap: 2.6, stroke: 1.6, fill: true }), { scale: 0.82 }),
    'cand-d-whole-doodle': () =>
        frame(
            `<path d="${SHELL} ${HATCH}" fill="none" stroke="${INK}" stroke-width="2.4"
               stroke-linecap="round" stroke-linejoin="round"/>`,
            { scale: 0.86 }
        ),
    'cand-c-mascot-bust': () => mascotBust(),
}

/** Contact strip: 512 / 64 / 48 / 16, each pixel-doubled so the small ones are visible. */
async function strip(name, png) {
    const cells = await Promise.all(
        [512, 64, 48, 16].map(async (px) => {
            const small = await sharp(png).resize(px, px, { kernel: 'lanczos3' }).png().toBuffer()
            return sharp(small).resize(192, 192, { kernel: 'nearest' }).png().toBuffer()
        })
    )
    await sharp({ create: { width: 192 * 4 + 30, height: 192, channels: 4, background: '#E5E5E5' } })
        .composite(cells.map((input, i) => ({ input, top: 0, left: i * 202 })))
        .png()
        .toFile(`${OUT}/strip-${name}.png`)
}

for (const [name, make] of Object.entries(CANDIDATES)) {
    const png = await make()
    writeFileSync(`${OUT}/${name}.png`, png)
    await strip(name, png)
    console.log(name, (png.length / 1024).toFixed(1) + ' kB')
}
await strip('current', readFileSync('public/icons/icon-512.png'))
console.log('current strip ok')
