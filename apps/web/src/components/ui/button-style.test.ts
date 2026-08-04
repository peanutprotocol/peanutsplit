import { describe, expect, it } from 'vitest'
import { buttonClassName } from './button-style'

describe('buttonClassName', () => {
    it('keeps the full-width interactive Button defaults', () => {
        const classes = buttonClassName().split(' ')
        expect(classes).toEqual(
            expect.arrayContaining(['btn', 'btn-primary', 'w-full', 'active:translate-x-[3px]', 'active:shadow-none'])
        )
    })

    it('supports compact links and non-interactive inner artwork without duplicating recipes', () => {
        const classes = buttonClassName({
            variant: 'stroke',
            width: 'auto',
            shadowSize: '4',
            interactive: false,
        }).split(' ')

        expect(classes).toEqual(expect.arrayContaining(['btn', 'btn-stroke', 'w-auto', 'btn-shadow-primary-4']))
        expect(classes).not.toEqual(expect.arrayContaining(['active:translate-x-[3px]', 'active:shadow-none']))
    })
})
