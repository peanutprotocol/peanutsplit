import type { PluginListenerHandle } from '@capacitor/core'

/** A disposer that does nothing, for listeners that could not be attached. */
export const noop = (): void => {}

/**
 * Runs one plugin call and turns any failure into `fallback`.
 *
 * In a plain browser (local smokes, the e2e suite) the native bridge is missing and most plugin
 * methods reject with "not implemented". The wrappers must never throw for that, so every screen
 * runs unchanged in a browser.
 */
export async function quietly<T>(call: () => Promise<T>, fallback: T): Promise<T> {
    try {
        return await call()
    } catch {
        return fallback
    }
}

/** Attaches a plugin listener and returns a plain disposer; a no-op disposer if attaching fails. */
export async function listen(attach: () => Promise<PluginListenerHandle>): Promise<() => void> {
    try {
        const handle = await attach()
        return () => {
            void handle.remove().catch(noop)
        }
    } catch {
        return noop
    }
}
