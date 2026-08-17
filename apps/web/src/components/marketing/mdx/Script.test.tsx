import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { currencyOf, EditableScript, ScriptEnhancer } from './ScriptEnhancer'
import { Script } from './Script'

/**
 * vitest runs in `node` here — there is no jsdom, so a real tap cannot be dispatched, and no Next
 * request pipeline either, so `next/dynamic`'s real lazy-loading (which only resolves through
 * Next's own bundler) cannot run. The mock below defers to `ScriptEnhancer` at RENDER time rather
 * than at `dynamic()`-call time, so it needs no import-order guarantee against `./Script`.
 */
vi.mock('next/dynamic', () => ({
    default: () => (props: { text: string; children: React.ReactNode }) => <ScriptEnhancer {...props} />,
}))

class StubIntersectionObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
}
// @ts-expect-error test stub, not a full IntersectionObserver implementation
global.IntersectionObserver = StubIntersectionObserver

vi.mock('@/lib/use-motion', () => ({ useMotionAllowed: vi.fn(() => true) }))

describe('Script', () => {
    it("server-renders today's plain blockquote fallback, in Quote's own classes", () => {
        const html = renderToStaticMarkup(<Script source="Group chat">Hey, you owe me €12 for pizza</Script>)
        expect(html).toContain('Hey, you owe me €12 for pizza')
        expect(html).toContain('border-t border-dashed border-n-1')
        expect(html).toContain('Group chat')
    })

    it('never renders the editable/copy enhancement before activation', () => {
        const html = renderToStaticMarkup(<Script source="Group chat">Hey, you owe me €12 for pizza</Script>)
        expect(html).not.toContain('aria-label="Amount"')
        expect(html).not.toContain('>Copy<')
    })
})

describe('currencyOf', () => {
    it('reads the currency off a symbol', () => {
        expect(currencyOf('€12')).toBe('EUR')
        expect(currencyOf('$8')).toBe('USD')
        expect(currencyOf('£15,50')).toBe('GBP')
    })

    it('reads the currency off a trailing code', () => {
        expect(currencyOf('12.50 EUR')).toBe('EUR')
    })

    it('returns null once editing has removed every symbol/code trace', () => {
        expect(currencyOf('12')).toBeNull()
    })
})

describe('EditableScript', () => {
    it("shows the parsed amount as an 'Each' row, formatted through the shared money formatter", () => {
        const html = renderToStaticMarkup(<EditableScript text="Hey, you owe me €12 for pizza" />)
        expect(html).toContain('Each')
        expect(html).toContain('€12.00')
    })

    it('renders no confirmation row when the message has no recognisable amount', () => {
        const html = renderToStaticMarkup(<EditableScript text="Hey, settle up whenever" />)
        expect(html).not.toContain('Each')
    })
})

describe('ScriptEnhancer wiring', () => {
    const source = readFileSync(new URL('./ScriptEnhancer.tsx', import.meta.url), 'utf8')

    it("is a 'use client' module — Island's render prop cannot be built in a Server Component", () => {
        expect(source.startsWith("'use client'")).toBe(true)
    })

    it('copies through the shared clipboard helper, not a bespoke navigator.clipboard call', () => {
        expect(source).toContain("from '@/lib/clipboard'")
        expect(source).toContain('copyText(toCopy)')
    })

    it('wraps Island with a render prop, never passing children as the enhancement', () => {
        expect(source).toContain("import { Island } from '@/components/marketing/Island'")
        expect(source).toContain('render={() => <EditableScript text={text} />}')
    })
})
