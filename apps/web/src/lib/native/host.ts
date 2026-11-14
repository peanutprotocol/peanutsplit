/** The wrapper module type, for callers that hold the loaded host. */
export type NativeHost = typeof import('./capacitor/index')

/**
 * The one door to Capacitor. Every Capacitor plugin import sits behind this dynamic import.
 *
 * The guard is the inline env comparison in a ternary, not the imported IS_NATIVE_APP constant:
 * webpack folds the inlined literal and drops the import() from the web build, but it does not see
 * through an imported binding, and the Capacitor chunk would ship to every web visitor.
 */
export function loadHost(): Promise<NativeHost> | null {
    return process.env.NEXT_PUBLIC_NATIVE_BUILD === '1' ? import('./capacitor/index') : null
}
