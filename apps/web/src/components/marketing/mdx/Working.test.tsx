import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CURRENCY_CATALOG } from '@/lib/currency-catalog'
import type { ToolWorking } from '@/tools/types'
import { Working } from './Working'

const workings: ToolWorking[] = [
    { label: 'Rent', amountMinor: 150000 },
    { label: 'Floor area measured', value: '62 sqm' },
]

describe('Working', () => {
    it('pairs each label with its formatted value — money via formatMoney, non-money verbatim', () => {
        const html = renderToStaticMarkup(
            <Working
                workings={workings}
                roundingNote="Whatever is left goes to the largest fractions."
                currency="EUR"
                catalog={CURRENCY_CATALOG}
            />
        )
        expect(html).toContain('Rent')
        expect(html).toContain('€1,500.00')
        expect(html).toContain('Floor area measured')
        expect(html).toContain('62 sqm')
    })

    it('gives every row the tabular-nums class', () => {
        const html = renderToStaticMarkup(
            <Working workings={workings} roundingNote="x" currency="EUR" catalog={CURRENCY_CATALOG} />
        )
        expect(html.match(/tabular-nums/g)?.length).toBe(workings.length)
    })

    it('renders the rounding note verbatim', () => {
        const note = 'Whatever is left at the end goes to the largest fractions first, one unit each.'
        const html = renderToStaticMarkup(
            <Working workings={workings} roundingNote={note} currency="EUR" catalog={CURRENCY_CATALOG} />
        )
        expect(html).toContain(note)
    })
})
