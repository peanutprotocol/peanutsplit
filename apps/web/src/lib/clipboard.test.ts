import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyImage, copyText } from './clipboard'

/**
 * A textarea with only the surface `copyWithTextarea` touches. The suite runs in
 * the node environment, so there is no DOM to borrow one from — and the point of
 * these tests is the branch that gets picked, not layout.
 */
function fakeDocument(execCommandResult: boolean) {
    const appended: Record<string, unknown>[] = []
    const removed: Record<string, unknown>[] = []
    const copied: string[] = []
    const element = {
        value: '',
        readOnly: false,
        tabIndex: 0,
        style: {} as Record<string, string>,
        setAttribute: () => {},
        focus: () => {},
        select: () => {},
        setSelectionRange: () => {},
        remove: () => removed.push(element),
    }
    const document = {
        createElement: () => element,
        body: { appendChild: (node: Record<string, unknown>) => appended.push(node) },
        getSelection: () => null,
        execCommand: () => {
            copied.push(element.value)
            return execCommandResult
        },
    }
    return { document, element, appended, removed, copied }
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('copyText', () => {
    it('uses the clipboard API when it is there', async () => {
        const written: string[] = []
        vi.stubGlobal('navigator', { clipboard: { writeText: async (text: string) => void written.push(text) } })
        const dom = fakeDocument(true)
        vi.stubGlobal('document', dom.document)

        await expect(copyText('room link')).resolves.toBe(true)
        expect(written).toEqual(['room link'])
        // The deprecated path stays untouched when the modern one works.
        expect(dom.copied).toEqual([])
    })

    it('falls back to the textarea when the clipboard API is missing', async () => {
        // Every non-secure origin: `navigator.clipboard` is simply not defined.
        vi.stubGlobal('navigator', {})
        const dom = fakeDocument(true)
        vi.stubGlobal('document', dom.document)

        await expect(copyText('room link')).resolves.toBe(true)
        expect(dom.copied).toEqual(['room link'])
        expect(dom.appended).toHaveLength(1)
        // Nothing is left behind in the page either way.
        expect(dom.removed).toHaveLength(1)
    })

    it('falls back to the textarea when the clipboard API rejects', async () => {
        vi.stubGlobal('navigator', {
            clipboard: {
                writeText: async () => {
                    throw new Error('NotAllowedError')
                },
            },
        })
        const dom = fakeDocument(true)
        vi.stubGlobal('document', dom.document)

        await expect(copyText('room link')).resolves.toBe(true)
        expect(dom.copied).toEqual(['room link'])
    })

    it('reports failure when neither path copies', async () => {
        vi.stubGlobal('navigator', {})
        const dom = fakeDocument(false)
        vi.stubGlobal('document', dom.document)

        await expect(copyText('room link')).resolves.toBe(false)
        expect(dom.removed).toHaveLength(1)
    })

    it('reports failure rather than throwing when there is no document', async () => {
        vi.stubGlobal('navigator', {})
        vi.stubGlobal('document', undefined)

        await expect(copyText('room link')).resolves.toBe(false)
    })
})

describe('copyImage', () => {
    const png = new Blob(['recap'], { type: 'image/png' })

    it('hands the blob over under its own MIME type', async () => {
        const written: Record<string, Blob>[] = []
        vi.stubGlobal(
            'ClipboardItem',
            class {
                constructor(readonly items: Record<string, Blob>) {}
            }
        )
        vi.stubGlobal('navigator', {
            clipboard: {
                write: async ([item]: { items: Record<string, Blob> }[]) => void written.push(item.items),
            },
        })

        await expect(copyImage(png)).resolves.toBe(true)
        expect(Object.keys(written[0])).toEqual(['image/png'])
    })

    it('reports failure where images cannot reach the clipboard at all', async () => {
        // Firefox has no `ClipboardItem`; a non-secure origin has no clipboard.
        vi.stubGlobal('ClipboardItem', undefined)
        vi.stubGlobal('navigator', { clipboard: { write: async () => {} } })

        await expect(copyImage(png)).resolves.toBe(false)
    })

    it('reports failure when the write is refused', async () => {
        vi.stubGlobal('ClipboardItem', class {})
        vi.stubGlobal('navigator', {
            clipboard: {
                write: async () => {
                    throw new Error('NotAllowedError')
                },
            },
        })

        await expect(copyImage(png)).resolves.toBe(false)
    })
})
