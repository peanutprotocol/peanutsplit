import { readFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import { describe, expect, it } from 'vitest'

/**
 * `bodyFontClassName` lives outside src/app, so the utilities it names exist
 * only if tailwind.config.js scans this directory. When src/lib fell out of
 * the content globs, `.font-sans` vanished from the built CSS and every page
 * rendered in the browser's serif fallback — no build step failed. Compile
 * the real config and require every utility the layout puts on <body>.
 *
 * fonts.ts is read as source, not imported: next/font only runs under the
 * Next compiler. The list below is pinned against the file's text so a
 * renamed utility fails here instead of silently dropping out of the pin.
 */
const BODY_UTILITIES = ['font-sans']

describe('bodyFontClassName utilities survive the Tailwind content scan', () => {
    const fontsSource = readFileSync(path.resolve(__dirname, 'fonts.ts'), 'utf8')

    it('pins the utilities fonts.ts actually uses', () => {
        for (const cls of BODY_UTILITIES) {
            expect(fontsSource).toContain(cls)
        }
    })

    it('emits a rule for each utility on <body>', async () => {
        const configPath = path.resolve(__dirname, '../../tailwind.config.js')
        const { css } = await postcss([tailwindcss(configPath)]).process('@tailwind utilities;', {
            from: undefined,
        })

        for (const cls of BODY_UTILITIES) {
            expect(css, `missing .${cls} — is its source file inside the config's content globs?`).toContain(`.${cls}`)
        }
    })
})
