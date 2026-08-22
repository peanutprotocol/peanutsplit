import { describe, expect, it } from 'vitest'
import { fill } from './phrases'

/**
 * `fill()` has no test anywhere else, and its one deliberate oddity — leaving an unresolved
 * placeholder standing rather than blanking it — is the behaviour a translated phrase relies on
 * to be reportable.
 */
describe('fill', () => {
    const cases: readonly (readonly [string, Record<string, string | number>, string])[] = [
        ['{share} de {total} partes', { share: '0,5', total: 3 }, '0,5 de 3 partes'],
        ['{unit} por {unit}', { unit: 'km' }, 'km por km'],
        ['Pon un valor por cada {unit}.', {}, 'Pon un valor por cada {unit}.'],
        ['nothing to fill', { share: '1' }, 'nothing to fill'],
    ]

    it.each(cases)('fills %s', (template, values, expected) => {
        expect(fill(template, values)).toBe(expected)
    })
})
