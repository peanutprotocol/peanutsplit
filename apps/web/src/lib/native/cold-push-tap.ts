/**
 * Resolves with the room of a notification tap that launched the app, or null when the launch
 * did not come from a tap.
 *
 * Stub until task 3A: no push client yet, so never a tap.
 */
export async function awaitColdPushTap(): Promise<{ slug: string; sendId: string } | null> {
    return null
}
