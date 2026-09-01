import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BODY_FONT, DISPLAY_FONT, ogFonts } from './fonts'

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }))

const mocked = vi.mocked(readFile)
const buffer = (byte: number) => Buffer.from([byte, byte, byte, byte])

afterEach(() => {
    vi.resetAllMocks()
})

const enoent = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' })

describe('ogFonts', () => {
    it('registers the display face when the licensed file is present', async () => {
        mocked.mockImplementation(async (file) =>
            String(file).includes('knerd') ? buffer(1) : buffer(String(file).includes('900') ? 9 : 4)
        )

        const fonts = await ogFonts()
        const display = fonts.find((font) => font.name === DISPLAY_FONT)!
        expect(new Uint8Array(display.data)[0]).toBe(1)
    })

    // Knerd is Any-Type Foundry's and cannot be redistributed, so a build may legitimately lack it.
    // Satori has no fallback chain: without this, every share card 500s instead of losing a typeface.
    it('falls back to the bold body face when the proprietary display face is absent', async () => {
        mocked.mockImplementation(async (file) => {
            if (String(file).includes('knerd')) throw enoent()
            return buffer(String(file).includes('900') ? 9 : 4)
        })

        const fonts = await ogFonts()
        const display = fonts.find((font) => font.name === DISPLAY_FONT)!
        const bodyBold = fonts.find((font) => font.name === BODY_FONT && font.weight === 800)!
        expect(new Uint8Array(display.data)[0]).toBe(9)
        expect(display.data).toBe(bodyBold.data)
    })

    // A missing Roboto, or an unreadable Knerd, is a broken image — not a licence boundary.
    it('still throws when a read fails for any reason other than an absent file', async () => {
        mocked.mockImplementation(async (file) => {
            if (String(file).includes('knerd')) throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
            return buffer(4)
        })

        await expect(ogFonts()).rejects.toThrow('EACCES')
    })
})
