import screens from './splash-screens.json'

/**
 * iOS launch screens.
 *
 * An installed iOS web app shows `background_color` while it boots unless a matching
 * `<link rel="apple-touch-startup-image">` exists — and iOS matches on the exact device geometry,
 * not on a nearest fit, so every phone needs its own file or it gets the blank cream screen.
 * `splash-screens.json` is that device table, and it is the only copy: `scripts/generate-icons.mjs`
 * renders one PNG per row, this module writes the tags that point at them. Add a device in one
 * place, run `pnpm icons`, and both sides move together.
 *
 * Portrait only, deliberately. The manifest asks for `orientation: 'portrait'`, the app is a phone
 * app, and a landscape launch falls back to `background_color` — which is the same `#FAF4F0` the
 * splash is drawn on, so the worst case is the mark missing for the second the app takes to boot,
 * not a stretched image. Twenty-two files instead of forty-four for that.
 */
export interface SplashScreen {
    /** Documentation only — nothing reads it. It is here so a row can be recognised. */
    device: string
    /** CSS pixels, portrait. */
    width: number
    height: number
    /** `-webkit-device-pixel-ratio`. */
    ratio: number
}

export const SPLASH_SCREENS: readonly SplashScreen[] = screens

/** Where `generate-icons.mjs` writes the PNG for one row, and where the link tag points. */
export function splashUrl({ width, height, ratio }: SplashScreen): string {
    return `/icons/splash/splash-${width * ratio}x${height * ratio}.png`
}

/**
 * `metadata.appleWebApp.startupImage`. Next emits one `<link rel="apple-touch-startup-image">` per
 * entry with the `media` attribute verbatim, so the query has to be the one iOS matches against:
 * device-width and device-height in CSS pixels, the pixel ratio, and the orientation.
 */
export function appleStartupImages(): { url: string; media: string }[] {
    return SPLASH_SCREENS.map((screen) => ({
        url: splashUrl(screen),
        media:
            `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) ` +
            `and (-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: portrait)`,
    }))
}
