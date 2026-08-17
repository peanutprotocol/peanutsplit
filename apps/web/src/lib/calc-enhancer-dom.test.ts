import { describe, expect, it } from 'vitest'
import { enhanceCalcBlock, enhanceCalcBlocks } from './calc-enhancer-dom'

/**
 * vitest runs in `node` here (see vitest.config.ts) — there is no jsdom, so a hand-rolled stub
 * stands in for the narrow getAttribute/querySelector/addEventListener surface `enhanceCalcBlock`
 * actually touches, exactly as `script-enhancer-dom.test.ts` does for the other enhancer.
 */

type Listener = () => void | Promise<void>

class FakeElement {
    private listeners: Record<string, Listener[]> = {}
    private attrs: Record<string, string>
    private children: Record<string, FakeElement | null>
    private lists: Record<string, FakeElement[]>
    textContent: string | null

    constructor(
        options: {
            attrs?: Record<string, string>
            children?: Record<string, FakeElement | null>
            lists?: Record<string, FakeElement[]>
            textContent?: string | null
        } = {}
    ) {
        this.attrs = options.attrs ?? {}
        this.children = options.children ?? {}
        this.lists = options.lists ?? {}
        this.textContent = options.textContent ?? null
    }

    getAttribute(name: string): string | null {
        return this.attrs[name] ?? null
    }

    setAttribute(name: string, value: string): void {
        this.attrs[name] = value
    }

    querySelector(selector: string): FakeElement | null {
        return this.children[selector] ?? null
    }

    querySelectorAll(selector: string): FakeElement[] {
        return this.lists[selector] ?? []
    }

    addEventListener(type: string, listener: Listener): void {
        ;(this.listeners[type] ??= []).push(listener)
    }

    async fire(type: string): Promise<void> {
        for (const listener of this.listeners[type] ?? []) await listener()
    }
}

const PRESETS = { Weekend: 92000, Week: 184600, Blowout: 321000 }

/** One row of the working strip: a label cell and the `.tabular-nums` value cell the enhancer
 *  rewrites, the same shape `Calc.tsx` server-renders. */
function row(value: string) {
    const cell = new FakeElement({ textContent: value })
    return { node: new FakeElement({ children: { '.tabular-nums': cell } }), cell }
}

function chip(label: string, amount: string, pressed: boolean) {
    const amountNode = new FakeElement({ textContent: amount })
    const node = new FakeElement({
        attrs: { 'data-calc-preset': label, 'aria-pressed': String(pressed) },
        children: { '.split-calc-chip-amount': amountNode },
    })
    return { node, amountNode }
}

/** The article's own block: three presets, `Week` live, four people. */
function block(options: { presets?: string; people?: string; currency?: string } = {}) {
    const week = chip('Week', '€1,846.00', true)
    const weekend = chip('Weekend', '€920.00', false)
    const each = new FakeElement({ textContent: '€461.50' })
    const total = row('€1,846.00')
    const people = row('4')
    const share = row('€461.50')
    const foot = row('20 → 3')
    const root = new FakeElement({
        attrs: {
            'data-calc-presets': options.presets ?? JSON.stringify(PRESETS),
            'data-calc-currency': options.currency ?? 'EUR',
            'data-calc-people': options.people ?? '4',
        },
        children: {
            '[data-calc-each]': each,
            "[data-calc-row='total']": total.node,
            "[data-calc-row='people']": people.node,
            "[data-calc-row='share']": share.node,
            "[data-calc-row='foot']": foot.node,
        },
        lists: { '[data-calc-preset]': [weekend.node, week.node] },
    })
    return { root, weekend, week, each, total, people, share, foot }
}

describe('enhanceCalcBlock', () => {
    it('recomputes the headline share and the working rows from the clicked preset', async () => {
        const { root, weekend, each, total, share } = block()
        enhanceCalcBlock(root as unknown as Element)
        await weekend.node.fire('click')

        expect(each.textContent).toBe('€230.00')
        expect(total.cell.textContent).toBe('€920.00')
        expect(share.cell.textContent).toBe('€230.00')
    })

    it('leaves the footnote row alone — its value is authored copy, not arithmetic', async () => {
        const { root, weekend, foot } = block()
        enhanceCalcBlock(root as unknown as Element)
        await weekend.node.fire('click')

        expect(foot.cell.textContent).toBe('20 → 3')
    })

    it('moves aria-pressed onto exactly the clicked chip', async () => {
        const { root, weekend, week } = block()
        enhanceCalcBlock(root as unknown as Element)
        await weekend.node.fire('click')

        expect(weekend.node.getAttribute('aria-pressed')).toBe('true')
        expect(week.node.getAttribute('aria-pressed')).toBe('false')
    })

    it('repaints every chip amount from the parsed minor units, not from the server text', async () => {
        const { root, weekend, week } = block()
        weekend.amountNode.textContent = 'stale'
        week.amountNode.textContent = 'stale'
        enhanceCalcBlock(root as unknown as Element)
        await weekend.node.fire('click')

        expect(weekend.amountNode.textContent).toBe('€920.00')
        expect(week.amountNode.textContent).toBe('€1,846.00')
    })

    it('rounds the share to the smallest unit, the way Calc.tsx does on the server', async () => {
        const { root, weekend, share } = block({ presets: JSON.stringify({ Weekend: 1001 }), people: '3' })
        enhanceCalcBlock(root as unknown as Element)
        await weekend.node.fire('click')

        expect(share.cell.textContent).toBe('€3.34')
    })

    it.each([
        ['malformed JSON', { presets: '{not json' }],
        ['a non-integer preset value', { presets: '{"Weekend":92000.5}' }],
        ['a headcount of zero', { people: '0' }],
        ['a missing currency', { currency: '' }],
    ])('is a no-op for %s — never a throw, never a rewrite', async (_name, override) => {
        const { root, weekend, each } = block(override)
        expect(() => enhanceCalcBlock(root as unknown as Element)).not.toThrow()
        await weekend.node.fire('click')
        expect(each.textContent).toBe('€461.50')
    })
})

describe('enhanceCalcBlocks', () => {
    it('enhances every [data-calc-block] found under root', async () => {
        const first = block()
        const second = block()
        const root = { querySelectorAll: () => [first.root, second.root] }
        enhanceCalcBlocks(root as unknown as ParentNode)
        await first.weekend.node.fire('click')
        await second.weekend.node.fire('click')

        expect(first.each.textContent).toBe('€230.00')
        expect(second.each.textContent).toBe('€230.00')
    })
})
