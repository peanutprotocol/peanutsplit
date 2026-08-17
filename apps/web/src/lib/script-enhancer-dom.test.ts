import { afterEach, describe, expect, it, vi } from 'vitest'

const { copyTextMock } = vi.hoisted(() => ({ copyTextMock: vi.fn(async () => true) }))
vi.mock('./clipboard', () => ({ copyText: copyTextMock }))

import { enhanceScriptBlock, enhanceScriptBlocks } from './script-enhancer-dom'

/**
 * vitest runs in `node` here (see use-motion.test.ts) — there is no jsdom, so a hand-rolled stub
 * stands in for the narrow querySelector/addEventListener surface `enhanceScriptBlock` actually
 * touches, the same pattern `StubIntersectionObserver` uses elsewhere in this suite.
 */

type Listener = () => void | Promise<void>

class FakeElement {
    private listeners: Record<string, Listener[]> = {}
    private attrs: Record<string, string>
    private children: Record<string, FakeElement | null>
    textContent: string | null
    value: string
    hidden = false

    constructor(
        options: {
            attrs?: Record<string, string>
            children?: Record<string, FakeElement | null>
            textContent?: string | null
            value?: string
        } = {}
    ) {
        this.attrs = options.attrs ?? {}
        this.children = options.children ?? {}
        this.textContent = options.textContent ?? null
        this.value = options.value ?? ''
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
    }
}

/** One `[data-script-block]` fixture: `amount`/`withEach` mirror the two shapes `Script.tsx` can
 *  server-render — a message with a recognisable amount (input + Each row) or without (neither). */
function block(options: { rest?: string; amount?: string; withEach?: boolean } = {}) {
    const valueCell = options.withEach ? new FakeElement({ textContent: '€0.00' }) : null
    const each = options.withEach ? new FakeElement({ children: { '.tabular-nums': valueCell } }) : null
    const input = options.amount !== undefined ? new FakeElement({ value: options.amount }) : null
    const copyButton = new FakeElement({ textContent: 'Copy' })
    const root = new FakeElement({
        attrs: { 'data-script-rest': options.rest ?? '' },
        children: { '[data-script-amount]': input, '[data-script-copy]': copyButton, '[data-script-each]': each },
    })
    return { root, input, copyButton, each, valueCell }
}

afterEach(() => copyTextMock.mockClear())

describe('enhanceScriptBlock', () => {
    it('copies rest + the live input value, joined and trimmed', async () => {
        const { root, input, copyButton } = block({ rest: 'Hey, you owe me for pizza', amount: '€12', withEach: true })
        enhanceScriptBlock(root as unknown as Element)
        input!.value = '€15'
        await copyButton.fire('click')
        expect(copyTextMock).toHaveBeenCalledWith('Hey, you owe me for pizza €15')
    })

    it('copies just the rest text when the block has no editable amount', async () => {
        const { root, copyButton } = block({ rest: 'Hey, settle up whenever' })
        enhanceScriptBlock(root as unknown as Element)
        await copyButton.fire('click')
        expect(copyTextMock).toHaveBeenCalledWith('Hey, settle up whenever')
    })

    it('shows "Copied" once the copy resolves true', async () => {
        const { root, copyButton } = block({ rest: 'Hey, settle up whenever' })
        enhanceScriptBlock(root as unknown as Element)
        await copyButton.fire('click')
        expect(copyButton.textContent).toBe('Copied')
    })

    it('recomputes the Each row live as the amount changes', async () => {
        const { root, input, each, valueCell } = block({ amount: '€12', withEach: true })
        enhanceScriptBlock(root as unknown as Element)
        input!.value = '€20'
        await input!.fire('input')
        expect(valueCell!.textContent).toBe('€20.00')
        expect(each!.hidden).toBe(false)
    })

    it('hides the Each row once the amount no longer carries a recognisable currency', async () => {
        const { root, input, each } = block({ amount: '€12', withEach: true })
        enhanceScriptBlock(root as unknown as Element)
        input!.value = '12'
        await input!.fire('input')
        expect(each!.hidden).toBe(true)
    })

    it('does nothing when the block has no editable amount — no crash, no recompute wired', () => {
        const { root } = block({ rest: 'Hey, settle up whenever' })
        expect(() => enhanceScriptBlock(root as unknown as Element)).not.toThrow()
    })
})

describe('enhanceScriptBlocks', () => {
    it('enhances every [data-script-block] found under root', async () => {
        const first = block({ rest: 'a' })
        const second = block({ rest: 'b' })
        const root = { querySelectorAll: () => [first.root, second.root] }
        enhanceScriptBlocks(root as unknown as ParentNode)
        await first.copyButton.fire('click')
        await second.copyButton.fire('click')
        expect(copyTextMock).toHaveBeenCalledWith('a')
        expect(copyTextMock).toHaveBeenCalledWith('b')
    })
})
