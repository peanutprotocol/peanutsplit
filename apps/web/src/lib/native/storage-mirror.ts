/**
 * Copies room-list and member-token keys from Preferences back into a localStorage that the OS
 * evicted (ARCHITECTURE 8.3). NativeShell awaits it before any screen mounts.
 *
 * Stub until task 2D: nothing to restore.
 */
export async function hydrateStorageMirror(): Promise<void> {}

/**
 * Mirrors every later write of those keys into Preferences.
 *
 * Stub until task 2D: mirrors nothing.
 */
export function installStorageMirror(): void {}
