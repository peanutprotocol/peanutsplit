/**
 * One way to put text on the clipboard, and one answer about whether it landed.
 *
 * `navigator.clipboard` is not always there to use. It is undefined on every
 * non-secure origin — a phone opening the room over `http://` on the local
 * network — and it rejects inside the in-app browsers a shared link most often
 * lands in, where the embedder never granted clipboard write. A copy button
 * whose only path is `writeText` does nothing at all in those places, which is
 * the whole of the "copy does not copy" report.
 *
 * So there are two paths: the modern one, then the hidden textarea plus
 * `document.execCommand('copy')` that predates it and still works in every one
 * of those cases. Both must run inside the click that asked for them — the
 * second one needs a live selection, the first needs the user activation.
 *
 * Callers get a boolean instead of a rejected promise, on purpose: a button
 * that flips to "Copied!" because the failure was swallowed is worse than one
 * that admits it failed.
 */

/**
 * Copies `text`. Returns true only if the clipboard actually took it — never
 * throws, so a caller can spend the answer directly on its success state.
 */
export async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
            return true
        }
    } catch {
        // Missing, blocked, or refused. The textarea below still works there.
    }
    return copyWithTextarea(text)
}

/**
 * The pre-`navigator.clipboard` trick. `execCommand` is deprecated and still
 * the only thing that copies on a non-secure origin, so it stays as the floor
 * rather than as history.
 */
function copyWithTextarea(text: string): boolean {
    if (typeof document === 'undefined') return false

    const textarea = document.createElement('textarea')
    textarea.value = text
    // Invisible, unreachable by tab or thumb, and `readOnly` so a phone does not
    // raise its keyboard for a field nobody is meant to see. Positioned rather
    // than `display: none`, because a hidden element has nothing to select.
    textarea.readOnly = true
    textarea.setAttribute('aria-hidden', 'true')
    textarea.tabIndex = -1
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)

    // Whatever the reader had selected is theirs. Put it back.
    const selection = document.getSelection()
    const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    try {
        textarea.focus()
        textarea.select()
        textarea.setSelectionRange(0, text.length)
        return document.execCommand('copy')
    } catch {
        return false
    } finally {
        textarea.remove()
        if (selection && previous) {
            selection.removeAllRanges()
            selection.addRange(previous)
        }
    }
}
