/** Every route in the bundled app, as `src/app/(native)` exports them (trailing slash on). */
export const NATIVE_ROUTES: readonly string[] = ['/', '/app/', '/new/', '/room/', '/room/import/', '/import/']

/** The navigation calls `dispatchNativeLink` needs, injected so the function stays pure. */
export type NativeNav = {
    currentPath(): string
    replace(p: string): void
    push(p: string): void
    openExternal(u: string): void
}

/**
 * Maps a URL (a universal link, an App Link or a boot path) to an in-app path, an external URL
 * for the system browser, or null when the app has nothing to show for it.
 *
 * Stub until task 2C: maps nothing.
 */
export function nativePathForUrl(input: string): { path: string } | { external: string } | null {
    return null
}

/**
 * The one handler for a link, whether it arrives as the launch URL or through `appUrlOpen`, so a
 * cold start navigates exactly once. Rules in PLAN.md 4.1.
 *
 * Stub until task 2C: ignores every link.
 */
export function dispatchNativeLink(
    url: string,
    source: 'launch' | 'open',
    nav: NativeNav,
    now: number = Date.now()
): 'navigated' | 'duplicate' | 'replayed' | 'ignored' {
    return 'ignored'
}
