import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SPLASH_SCREENS, appleStartupImages, splashUrl } from './splash'

/**
 * A launch screen iOS cannot match is a file nobody is ever served, and a tag pointing at a file
 * that was never rendered is a 404 on the one request made while the app boots. Both failures are
 * silent on a phone, so they are caught here instead.
 */
describe('iOS launch screens', () => {
    it('renders every device in the table', () => {
        const web = path.resolve(__dirname, '../..')
        for (const screen of SPLASH_SCREENS) {
            expect(existsSync(path.join(web, 'public', splashUrl(screen))), screen.device).toBe(true)
        }
    })

    it('gives each device a geometry no other device claims', () => {
        const keys = SPLASH_SCREENS.map(({ width, height, ratio }) => `${width}x${height}@${ratio}`)
        expect(new Set(keys).size).toBe(keys.length)
    })

    it('asks iOS for the exact match it makes: both dimensions, the pixel ratio, the orientation', () => {
        const iphone14 = appleStartupImages().find((image) => image.url.endsWith('splash-1170x2532.png'))
        expect(iphone14?.media).toBe(
            '(device-width: 390px) and (device-height: 844px) ' +
                'and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)'
        )
    })
})
