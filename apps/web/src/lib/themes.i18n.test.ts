import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en.json'
import { ROOM_THEMES } from './themes'

/**
 * The other computed key in the product, and the same blind spot as the error
 * codes: `ThemePicker` resolves `t(\`names.\${theme.nameKey}\`)`, so the i18n
 * audit sees a computed key and skips it. Catalog parity guarantees es/pt-BR
 * match en; this closes the other half by proving en covers every palette the
 * catalog in code actually ships.
 *
 * A gap renders the dotted key path as a swatch label — the exact failure the
 * audit exists to stop, arriving through the one door it cannot watch.
 */
describe('theme name coverage', () => {
    const names = en.room.theme.names as Record<string, string>

    it('has an English name for every palette in the catalog', () => {
        const missing = ROOM_THEMES.filter((theme) => typeof names[theme.nameKey] !== 'string')
        expect(missing.map((theme) => theme.key)).toEqual([])
    })

    it('has no orphan name left behind by a removed palette', () => {
        const shipped = new Set(ROOM_THEMES.map((theme) => theme.nameKey))
        expect(Object.keys(names).filter((key) => !shipped.has(key))).toEqual([])
    })
})
