import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SKIN_TOKENS } from './skin'

/**
 * The display-face ruling, as a gate (fun-engine.md Wave 2 / S3).
 *
 * The skin's signature type is Roboto Flex driven to a real condensed black — `font-stretch: 75%`
 * plus `font-weight: 900` on the family this app already loads. The rejected alternative was a
 * device font stack (`"Arial Narrow","Avenir Next Condensed",…`): none of those families exists on
 * Android or in the CI containers, so it would silently resolve to plain Roboto with a synthetic
 * bold — and a token-equality assertion on the stack string would never have noticed.
 *
 * What makes the ruling hold is `fonts.ts` requesting the `wdth` axis. Delete that one line and
 * every display rule flattens to a normal-width face with nothing else failing anywhere, so it is
 * pinned here. `fonts.ts` is read as source rather than imported — `next/font` only runs under the
 * Next compiler — the idiom `fonts.tailwind.test.ts` already uses.
 */
const fontsSource = readFileSync(path.resolve(__dirname, '../fonts.ts'), 'utf8')

describe('the sticker skin display face', () => {
    it('resolves through the app’s own Roboto Flex, at the condensed width', () => {
        expect(SKIN_TOKENS.sticker.display).toContain('var(--font-roboto)')
        expect(SKIN_TOKENS.sticker.displayStretch).toBe('75%')
    })

    it('still asks Roboto Flex for the width axis the ruling depends on', () => {
        const call = fontsSource.slice(fontsSource.indexOf('Roboto_Flex('))
        expect(call.slice(0, call.indexOf('})'))).toContain("axes: ['wdth']")
    })

    it('adds no font: two localFont calls, two Google families, and nothing else', () => {
        expect(fontsSource.match(/localFont\(/g)).toHaveLength(2)
        expect(fontsSource).toContain("import { Roboto_Flex, Sniglet } from 'next/font/google'")
        expect(fontsSource.match(/from 'next\/font\/google'/g)).toHaveLength(1)
    })

    it('adds no font asset on disk', () => {
        const assets = readdirSync(path.resolve(__dirname, '../../assets/fonts')).sort()
        expect(assets).toEqual(['knerd-filled.ttf', 'knerd-outline.ttf'])
    })

    it('leaves tailwind’s fontFamily alone — the display face is a painted var, not a utility', () => {
        const config = readFileSync(path.resolve(__dirname, '../../../tailwind.config.js'), 'utf8')
        const families = config.slice(config.indexOf('fontFamily: {'))
        expect(families.slice(0, families.indexOf('},'))).toBe(
            `fontFamily: {
                sans: ['var(--font-roboto)', ...fontFamily.sans],
                display: ['var(--font-sniglet)', ...fontFamily.sans],
                'knerd-outline': ['var(--font-knerd-outline)', ...fontFamily.sans],
                'knerd-filled': ['var(--font-knerd-filled)', ...fontFamily.sans],
                roboto: ['var(--font-roboto)', ...fontFamily.sans],
            `
        )
    })
})
