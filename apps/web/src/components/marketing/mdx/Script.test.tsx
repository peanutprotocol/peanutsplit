import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Script } from './Script'

/**
 * vitest runs in `node` here (see Island.test.tsx) — there is no jsdom, so a real tap cannot be
 * dispatched. The server-render snapshot covers the always-shipped fallback; the IntersectionObserver
 * stub (reused from Island.test.tsx) only needs to let the component mount without crashing; and the
 * clipboard wiring is asserted the same way Island.test.tsx asserts its own observer/handler wiring
 * — reading the source and checking the exact call is present, rather than dispatching a click that
 * has nowhere to run.
 */

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
