/**
 * A browser tab may show the public landing page. An installed app may not: opening the launcher
 * is an explicit product-use gesture, so a stale home-screen bookmark for `/` follows the current
 * app entry route as well. Safari's pre-standard flag is kept beside the display-mode signal for
 * older iOS installations.
 */
export const shouldRedirectStandaloneLanding = (
    pathname: string,
    displayModeStandalone: boolean,
    navigatorStandalone?: boolean
): boolean => pathname === '/' && (displayModeStandalone || navigatorStandalone === true)
