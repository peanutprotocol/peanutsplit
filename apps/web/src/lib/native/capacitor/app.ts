import { App } from '@capacitor/app'
import { listen, quietly } from './guard'

/** The URL that launched the app (a universal link or App Link), or null. */
export const getLaunchUrl = (): Promise<string | null> =>
    quietly(async () => (await App.getLaunchUrl())?.url ?? null, null)

/** The native build number (CFBundleVersion or versionCode), or null when it is unknown. */
export const getBuildNumber = (): Promise<number | null> =>
    quietly(async () => {
        const build = Number((await App.getInfo()).build)
        return Number.isInteger(build) && build > 0 ? build : null
    }, null)

/** Calls `handler` with each link that opens the app while it runs. Returns a disposer. */
export const onUrlOpen = (handler: (url: string) => void): Promise<() => void> =>
    listen(() => App.addListener('appUrlOpen', (event) => handler(event.url)))

/** Calls `handler` each time the app returns to the foreground. Returns a disposer. */
export const onResume = (handler: () => void): Promise<() => void> => listen(() => App.addListener('resume', handler))

/** Calls `handler` on the Android back button; attaching it disables the default back. Returns a disposer. */
export const onBackButton = (handler: (canGoBack: boolean) => void): Promise<() => void> =>
    listen(() => App.addListener('backButton', (event) => handler(event.canGoBack)))

/** Moves the app to the background (Android back on the first screen). False when unavailable. */
export const minimize = (): Promise<boolean> =>
    quietly(async () => {
        await App.minimizeApp()
        return true
    }, false)
