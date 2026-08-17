import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Script } from './Script'

describe('Script', () => {
    it("server-renders today's plain blockquote, in Quote's own classes, plus the source caption", () => {
        const html = renderToStaticMarkup(<Script source="Group chat">Hey, settle up whenever</Script>)
        expect(html).toContain('Hey, settle up whenever')
        expect(html).toContain('border-t border-dashed border-n-1')
        expect(html).toContain('Group chat')
    })

    it('server-renders the editable amount as a real input, not a post-activation swap', () => {
        const html = renderToStaticMarkup(<Script source="Group chat">Hey, you owe me €12 for pizza</Script>)
        expect(html).toContain('aria-label="Amount"')
        expect(html).toContain('value="€12"')
    })

    it('renders no input when the message has no recognisable amount', () => {
        const html = renderToStaticMarkup(<Script source="Group chat">Hey, settle up whenever</Script>)
        expect(html).not.toContain('aria-label="Amount"')
    })

    it("shows the amount as an 'Each' row, formatted through the shared money formatter (Working)", () => {
        const html = renderToStaticMarkup(<Script source="Group chat">Hey, you owe me €12 for pizza</Script>)
        expect(html).toContain('Each')
        expect(html).toContain('€12.00')
    })

    it('renders no confirmation row when the message has no recognisable amount', () => {
        const html = renderToStaticMarkup(<Script source="Group chat">Hey, settle up whenever</Script>)
        expect(html).not.toContain('Each')
    })

    it('server-renders a real copy button, always', () => {
        const html = renderToStaticMarkup(<Script source="Group chat">Hey, settle up whenever</Script>)
        expect(html).toContain('<button')
        expect(html).toContain('>Copy<')
    })

    it('carries the data attributes script-enhancer-dom.ts hooks onto', () => {
        const html = renderToStaticMarkup(<Script source="Group chat">Hey, you owe me €12 for pizza</Script>)
        expect(html).toContain('data-script-block')
        expect(html).toContain('data-script-amount')
        expect(html).toContain('data-script-each')
        expect(html).toContain('data-script-copy')
    })
})
