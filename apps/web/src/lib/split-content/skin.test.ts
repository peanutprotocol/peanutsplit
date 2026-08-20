import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SKIN_BY_SLUG, SKIN_DEFAULT, SKIN_TOKENS, skinFor, skinVars, type Skin } from './skin'
import { wallpaperDataUri } from './wallpaper'

describe('SKIN_BY_SLUG', () => {
    /** Empty is the correct state: the map is an override seam (opt-outs, a future second skin),
     *  not the rollout gate it was in Wave 2. Asserted, so re-pinning a slug is a deliberate act. */
    it('is empty — every page takes SKIN_DEFAULT unless a slug opts out', () => {
        expect(Object.keys(SKIN_BY_SLUG)).toHaveLength(0)
    })
})

describe('skinFor', () => {
    it('gives an unmapped slug SKIN_DEFAULT, and never throws — a skin is decoration', () => {
        expect(SKIN_DEFAULT).toBe('sticker')
        expect(() => skinFor('this-slug-does-not-exist', 'default')).not.toThrow()
        expect(skinFor('this-slug-does-not-exist', 'default')).toBe('sticker')
        expect(skinFor('', 'default')).toBe('sticker')
    })

    it('refuses the flat register before either the map or the default is consulted', () => {
        for (const slug of ['this-slug-does-not-exist', 'splitwise-daily-limit', '']) {
            expect(skinFor(slug, 'flat'), slug).toBe('none')
        }
    })

    /** The gate keys on the register ARGUMENT, not on the slug: `splitwise-daily-limit` is
     *  flat-register content, but this function has never heard of `FLAT_REGISTER_SLUGS` —
     *  `pageRecipe` is what supplies the `'flat'`, and recipe.test.ts asserts that end to end. */
    it('skins even the flat-register slug when it is handed the default register', () => {
        expect(skinFor('splitwise-daily-limit', 'default')).toBe('sticker')
        expect(skinFor('splitwise-daily-limit', 'flat')).toBe('none')
    })
})

describe('SKIN_TOKENS.sticker', () => {
    it('carries the locked palette, literally', () => {
        expect(SKIN_TOKENS.sticker).toMatchObject({
            ink: '#211C17',
            pink: '#FF90E8',
            yellow: '#FFC900',
            paper: '#FAF4F0',
            green: '#98E9AB',
            postit: '#FFF3C4',
            halo: '#FFFFFF',
            muted: '#5F646D',
            displayStretch: '75%',
            meta: 'ui-monospace,Menlo,monospace',
        })
        expect(SKIN_TOKENS.sticker.display).toContain('var(--font-roboto)')
    })

    it("paints the grey prose ACTUALLY uses — tailwind.config.js's grey.1, read as source", () => {
        const config = readFileSync(path.join(process.cwd(), 'tailwind.config.js'), 'utf8')
        const greyOne = /grey:\s*\{\s*1:\s*'(#[0-9A-Fa-f]{6})'/.exec(config)?.[1]
        expect(greyOne).toBeTruthy()
        expect(SKIN_TOKENS.sticker.muted).toBe(greyOne)
    })
})

describe('skinVars', () => {
    it("emits nothing at all for 'none', so an unskinned frame carries no --skin- property", () => {
        expect(skinVars('none', 123, 'trips')).toEqual({})
    })

    it('emits every palette var plus the wallpaper for the sticker skin', () => {
        const vars = skinVars('sticker', 123, 'trips')
        const token = SKIN_TOKENS.sticker

        expect(vars).toEqual({
            '--skin-ink': token.ink,
            '--skin-pink': token.pink,
            '--skin-yellow': token.yellow,
            '--skin-paper': token.paper,
            '--skin-green': token.green,
            '--skin-postit': token.postit,
            '--skin-halo': token.halo,
            '--skin-muted': token.muted,
            '--skin-display': token.display,
            '--skin-display-stretch': token.displayStretch,
            '--skin-meta': token.meta,
            '--skin-wall': wallpaperDataUri(123, 'trips'),
        })
    })

    it('is string-only, so one definition serves both frames and both stylesheets', () => {
        for (const value of Object.values(skinVars('sticker', 7, 'table'))) expect(typeof value).toBe('string')
    })

    it('is deterministic per (skin, seed, chapter)', () => {
        const skins: Skin[] = ['none', 'sticker']
        for (const skin of skins) expect(skinVars(skin, 42, 'home')).toEqual(skinVars(skin, 42, 'home'))
    })
})
