import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ShortVersionSlot } from './ShortVersionSlot'

const faq = {
    question: 'How many expenses can I add to Splitwise for free?',
    answer: 'Four a day. Splitwise’s help centre says free users can add up to 4 expenses each day, and it is the only Splitwise page that gives a number at all.',
}

describe('ShortVersionSlot', () => {
    it('renders nothing when the page declares no FAQ', () => {
        expect(renderToStaticMarkup(<ShortVersionSlot faq={undefined} locale="en" />)).toBe('')
    })

    it("renders the first FAQ's answer clamped to two lines, plus a jump link to #questions", () => {
        const html = renderToStaticMarkup(<ShortVersionSlot faq={faq} locale="en" />)
        expect(html).toContain('line-clamp-2')
        expect(html).toContain(faq.answer)
        expect(html).toContain('href="#questions"')
        expect(html).toContain('Questions')
    })

    it('translates the jump link with the locale — the FAQ heading label, not new copy', () => {
        expect(renderToStaticMarkup(<ShortVersionSlot faq={faq} locale="es-419" />)).toContain('Preguntas')
        expect(renderToStaticMarkup(<ShortVersionSlot faq={faq} locale="pt-br" />)).toContain('Perguntas')
    })
})
