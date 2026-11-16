'use client'

/**
 * Hand a generated file to the person: the room export, the history export, an image card.
 *
 * On web this is the `<a download>` click the call sites used to repeat, unchanged. The store app
 * cannot do that: WKWebView ignores `download`, so the click would save nothing. There the file goes
 * to `navigator.share({ files })`, which the native polyfill (`src/lib/native/polyfills.ts`) serves
 * by writing the file to the app cache and opening the system share sheet, where "Save to Files"
 * and every other target live. This module deliberately imports nothing from `src/lib/native`, so
 * the web bundle never reaches the native code through it.
 *
 * Resolves `true` when the file was handed over and `false` when the person closed the share sheet.
 * Closing the sheet is a decision, not a failure, so it never rejects for that. Any other share
 * error rejects, so the caller can say the save failed.
 */

import { IS_NATIVE_APP } from './platform'

export async function saveFile(blob: Blob, filename: string): Promise<boolean> {
    if (IS_NATIVE_APP) {
        try {
            await navigator.share({ files: [new File([blob], filename, { type: blob.type })] })
            return true
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return false
            throw error
        }
    }

    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    // Firefox may still be consuming the object URL when click() returns.
    window.setTimeout(() => URL.revokeObjectURL(href), 0)
    return true
}
