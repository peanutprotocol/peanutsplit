import { afterEach, describe, expect, it, vi } from 'vitest'
import { enhanceShareBlock, enhanceShareBlocks } from './share-enhancer-dom'

/**
 * vitest runs in `node` here (see vitest.config.ts) — there is no jsdom, so a hand-rolled stub
 * stands in for the narrow getAttribute/querySelector/addEventListener surface `enhanceShareBlock`
 * actually touches, exactly as `calc-enhancer-dom.test.ts` does for the other enhancer.
 *
 * `navigator` is stubbed per test rather than once: the whole point of this module is that the two
 * branches — a platform share sheet, and the clipboard where there is none — behave differently,
 * and a suite that only ever sees one of them proves nothing about the phone the link lands on.
 */

type Listener = () => void | Promise<void>

class FakeElement {
    private listeners: Record<string, Listener[]> = {}
    private attrs: Record<string, string>
    private children: Record<string, FakeElement | null>
    textContent: string | null

    constructor(
        options: {
            attrs?: Record<string, string>
            children?: Record<string, FakeElement | null>
            textContent?: string | null
        } = {}
    ) {
        this.attrs = options.attrs ?? {}
        this.children = options.children ?? {}
        this.textContent = options.textContent ?? null
    }

    getAttribute(name: string): string | null {
        return this.attrs[name] ?? null
    }

    querySelector(selector: string): FakeElement | null {
        return this.children[selector] ?? null
    }

    addEventListener(type: string, listener: Listener): void {
        ;(this.listeners[type] ??= []).push(listener)
    }

    async fire(type: string): Promise<void> {
        for (const listener of this.listeners[type] ?? []) await listener()
        // The click handler dispatches a promise it deliberately does not await (a listener cannot
        // return one). Yield a macrotask so the label swap has landed before an assertion reads it.
        await new Promise((resolve) => setTimeout(resolve, 0))
    }
}

const URL_WITH_CAMPAIGN = 'https://peanutsplit.com/blog/who-pays-for-the-wine?campaign=share-who-pays-for-the-wine'

/** The article's own block, the shape `Share.tsx` server-renders. An empty `url`/`done` omits the
 *  attribute entirely, which is the malformed case the enhancer has to survive. */
function block(options: { url?: string; done?: string } = {}) {
    const button = new FakeElement({ textContent: 'Send it round' })
    const attrs: Record<string, string> = {}
    if (options.url !== '') attrs['data-share-url'] = options.url ?? URL_WITH_CAMPAIGN
    if (options.done !== '') attrs['data-share-done'] = options.done ?? 'Link copied'
    const root = new FakeElement({ attrs, children: { '[data-share-button]': button } })
    return { root, button }
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('enhanceShareBlock with a platform share sheet', () => {
    it('hands the campaign-coded URL to navigator.share and leaves the label alone', async () => {
        const share = vi.fn(() => Promise.resolve())
        vi.stubGlobal('navigator', { share })
        const { root, button } = block()

        enhanceShareBlock(root as unknown as Element)
        await button.fire('click')

        expect(share).toHaveBeenCalledWith({ url: URL_WITH_CAMPAIGN })
        expect(button.textContent).toBe('Send it round')
    })

    it('stays silent when the reader dismisses the sheet — a rejection is not a failure to report', async () => {
        // The real dismissal is a DOMException whose `name` is AbortError; the enhancer branches on
        // that name, so the stub has to carry it rather than merely spell it in a message.
        const dismissal = Object.assign(new Error('share cancelled'), { name: 'AbortError' })
        vi.stubGlobal('navigator', { share: () => Promise.reject(dismissal), clipboard: { writeText: vi.fn() } })
        const { root, button } = block()

        enhanceShareBlock(root as unknown as Element)
        await expect(button.fire('click')).resolves.toBeUndefined()
        expect(button.textContent).toBe('Send it round')
        expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
    })

    /** A browser that advertises `share` and then refuses the payload (no user activation it
     *  recognises, an unsupported field) would otherwise leave the button a silent no-op — the one
     *  outcome worse than the copy fallback this module already has. */
    it('falls back to copying when the sheet fails for any reason but a dismissal', async () => {
        const writeText = vi.fn(() => Promise.resolve())
        const refusal = Object.assign(new Error('refused'), { name: 'NotAllowedError' })
        vi.stubGlobal('navigator', { share: () => Promise.reject(refusal), clipboard: { writeText } })
        const { root, button } = block()

        enhanceShareBlock(root as unknown as Element)
        await button.fire('click')

        expect(writeText).toHaveBeenCalledWith(URL_WITH_CAMPAIGN)
        expect(button.textContent).toBe('Link copied')
    })
})

describe('enhanceShareBlock without a share sheet', () => {
    it('copies the URL and swaps the button to the authored done label', async () => {
        const writeText = vi.fn(() => Promise.resolve())
        vi.stubGlobal('navigator', { clipboard: { writeText } })
        const { root, button } = block()

        enhanceShareBlock(root as unknown as Element)
        await button.fire('click')

        expect(writeText).toHaveBeenCalledWith(URL_WITH_CAMPAIGN)
        expect(button.textContent).toBe('Link copied')
    })

    /** `copyText` falls back to a hidden textarea, which needs a `document` — there is none in this
     *  env, so a refused clipboard is a refused copy, and the label must admit it. */
    it('keeps the idle label when the clipboard refuses', async () => {
        vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('denied')) } })
        const { root, button } = block()

        enhanceShareBlock(root as unknown as Element)
        await button.fire('click')

        expect(button.textContent).toBe('Send it round')
    })
})

describe('enhanceShareBlock on a block that is not one', () => {
    it.each([
        ['a missing share URL', { url: '' }],
        ['a missing done label', { done: '' }],
    ])('is a no-op for %s — never a throw, never a rewrite', async (_name, override) => {
        const writeText = vi.fn(() => Promise.resolve())
        vi.stubGlobal('navigator', { clipboard: { writeText } })
        const { root, button } = block(override)

        expect(() => enhanceShareBlock(root as unknown as Element)).not.toThrow()
        await button.fire('click')

        expect(writeText).not.toHaveBeenCalled()
        expect(button.textContent).toBe('Send it round')
    })

    it('is a no-op when there is no button to wire', () => {
        const root = new FakeElement({
            attrs: { 'data-share-url': URL_WITH_CAMPAIGN, 'data-share-done': 'Link copied' },
        })
        expect(() => enhanceShareBlock(root as unknown as Element)).not.toThrow()
    })
})

describe('enhanceShareBlocks', () => {
    it('enhances every [data-share-block] found under root', async () => {
        vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() } })
        const first = block()
        const second = block()
        const root = { querySelectorAll: () => [first.root, second.root] }

        enhanceShareBlocks(root as unknown as ParentNode)
        await first.button.fire('click')
        await second.button.fire('click')

        expect(first.button.textContent).toBe('Link copied')
        expect(second.button.textContent).toBe('Link copied')
    })
})
