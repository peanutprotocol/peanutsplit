import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SPLASH_SCREENS, appleStartupImages, splashUrl } from './splash'

const WEB = path.resolve(__dirname, '../..')

/**
 * A launch screen iOS cannot match is a file nobody is ever served, and a tag pointing at a file
 * that was never rendered is a 404 on the one request made while the app boots. Both failures are
 * silent on a phone, so they are caught here instead.
 */
describe('iOS launch screens', () => {
    it('renders every device in the table', () => {
        for (const screen of SPLASH_SCREENS) {
            expect(existsSync(path.join(WEB, 'public', splashUrl(screen))), screen.device).toBe(true)
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

    /**
     * Keeping the launch screens out of the service worker's precache costs `next.config.js` an
     * include list, because glob drops `!` patterns instead of treating them as exclusions. An
     * include list stops covering a folder that did not exist when it was written, and the symptom
     * — an asset silently missing offline — is invisible until someone is on a train. So the shape
     * of `public/` is pinned here: add a folder, and this fails until it is either added to the
     * patterns or deliberately recorded as online-only. `dev/` and `press/` are the latter: an
     * internal static quiz and downloadable distribution assets are not part of the installable
     * app shell.
     */
    it('keeps every public folder either precached or explicitly online-only', () => {
        const folders = readdirSync(path.join(WEB, 'public'), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort()
        expect(folders).toEqual(['dev', 'doodles', 'fonts', 'icons', 'press'])
    })
})
