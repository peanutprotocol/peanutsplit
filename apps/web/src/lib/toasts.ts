/**
 * Three toast durations, picked by one question: what does the reader still have
 * to do?
 *
 * Sonner's default is 4s for everything, which is simultaneously too long for a
 * confirmation of something already visible on screen and far too short for a
 * message ending in "refresh and try again" — the reader has to finish the
 * sentence, decide, and act, and the toast is gone before they have moved their
 * thumb. So the duration is a property of the message, not of the library.
 */
export const TOAST_MS = {
    /** Confirms something the screen already shows. Read it or don't. */
    default: 2_500,
    /** A state change worth registering — something moved that they did not watch move. */
    state: 5_000,
    /** The message asks for an action: undo, refresh, retry. It has to outlive the decision. */
    actionable: 8_000,
} as const
