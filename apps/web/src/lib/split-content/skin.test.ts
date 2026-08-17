import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOOL_SLUGS } from '@/tools/registry'
import { CHAPTER_BY_SLUG } from './recipe'
import { SKIN_BY_SLUG, SKIN_TOKENS, skinFor, skinVars, type Skin } from './skin'
import { wallpaperDataUri } from './wallpaper'

const MAPPED_SLUGS = Object.keys(SKIN_BY_SLUG)

describe('SKIN_BY_SLUG', () => {
    it('is the five-slug pilot: four content slugs plus one tool slug', () => {
        expect(MAPPED_SLUGS).toHaveLength(5)

        const contentSlugs = MAPPED_SLUGS.filter((slug) => slug in CHAPTER_BY_SLUG)
        const toolSlugs = MAPPED_SLUGS.filter((slug) => TOOL_SLUGS.includes(slug))

        expect(contentSlugs).toHaveLength(4)
        expect(toolSlugs).toEqual(['mileage-split-calculator'])
        // A slug is one or the other, never both — static-pages.ts reserves tool slugs against the
        // content tree, and CHAPTER_BY_SLUG growing a tool slug would fail recipe.test.ts.
        expect([...contentSlugs, ...toolSlugs].sort()).toEqual([...MAPPED_SLUGS].sort())
    })

    it('maps every pilot slug to the sticker skin', () => {
        for (const slug of MAPPED_SLUGS) expect(SKIN_BY_SLUG[slug], slug).toBe('sticker')
    })
})

describe('skinFor', () => {
    it("refuses the flat register before the map is consulted — 'none' even for a mapped slug", () => {
        for (const slug of MAPPED_SLUGS) expect(skinFor(slug, 'flat'), slug).toBe('none')
    })

    it('resolves every mapped slug on the default register', () => {
        for (const slug of MAPPED_SLUGS) expect(skinFor(slug, 'default'), slug).toBe('sticker')
    })

    it("returns 'none' for an unmapped slug and never throws — a skin is decoration", () => {
        expect(() => skinFor('this-slug-does-not-exist', 'default')).not.toThrow()
        expect(skinFor('this-slug-does-not-exist', 'default')).toBe('none')
        expect(skinFor('', 'default')).toBe('none')
        expect(skinFor('splitwise-daily-limit', 'default')).toBe('none')
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
