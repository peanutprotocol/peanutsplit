import { siteUrl } from '../site'

/**
 * True when `config` (public/app-config.json) says this build is too old for `platform`. Fails
 * open: anything it cannot read lets the app run.
 *
 * Stub until task 2H: never blocks.
 */
export function shouldBlock(config: unknown, platform: 'ios' | 'android' | 'web', build: number): boolean {
    return false
}

/**
 * The web URL that "Open in browser" opens from the update screen, for the screen the person
 * was on.
 *
 * Stub until task 2H: the web rooms home.
 */
export function gateFallbackUrl(pathname: string, search: string): string {
    return `${siteUrl}/app`
}

/**
 * Fetches the version config again, for example when the app resumes.
 *
 * Stub until task 2H: does nothing.
 */
export function checkVersionNow(): void {}
