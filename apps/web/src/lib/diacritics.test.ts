import { describe, expect, it } from 'vitest'
import { diacriticWordlist, findDroppedDiacritics } from './diacritics'

const found = (text: string, locale: 'es-419' | 'pt-br') => findDroppedDiacritics(text, locale).map((hit) => hit.found)

describe('the dropped-diacritic wordlist', () => {
    it('checks Spanish and Portuguese, and nothing in English', () => {
        expect(findDroppedDiacritics('a page about a codigo', 'en')).toEqual([])
        expect(diacriticWordlist('en')).toEqual([])
        expect(diacriticWordlist('es-419').length).toBeGreaterThan(0)
        expect(diacriticWordlist('pt-br').length).toBeGreaterThan(0)
    })

    /**
     * `usuario` is correct Spanish and wrong Portuguese. One merged wordlist would fail every
     * correct Spanish page that mentions a user, which is the shape of gate that gets suppressed.
     */
    it('does not apply a Portuguese rule to Spanish copy', () => {
        expect(found('cada usuario paga su parte', 'es-419')).toEqual([])
        expect(found('cada usuario paga sua parte', 'pt-br')).toEqual(['usuario'])
    })

    it('does not apply a Spanish rule to Portuguese copy', () => {
        expect(diacriticWordlist('pt-br')).not.toContain('tambien')
        expect(diacriticWordlist('pt-br')).not.toContain('quien')
    })
})

describe('unambiguous forms', () => {
    it('catches every shared form in both languages', () => {
        expect(found('el codigo es facil y rapido, ese numero', 'es-419')).toEqual([
            'codigo',
            'numero',
            'rapido',
            'facil',
        ])
        expect(found('o codigo e facil e rapido, esse numero', 'pt-br')).toEqual([
            'codigo',
            'numero',
            'rapido',
            'facil',
        ])
    })

    it('catches the Portuguese-only forms', () => {
        expect(found('voce nao faz a divisao', 'pt-br').sort()).toEqual(['divisao', 'nao', 'voce'])
    })

    it('catches the plural of a form as readily as the singular', () => {
        expect(found('dos codigos y varios numeros', 'es-419')).toEqual(['codigos', 'numeros'])
        expect(found('links faciles', 'es-419')).toEqual(['faciles'])
    })

    it('says what should have been written', () => {
        expect(findDroppedDiacritics('el codigo', 'es-419')).toEqual([{ found: 'codigo', expected: 'código' }])
    })

    it('catches a capitalised form at the start of a sentence', () => {
        expect(found('Codigo de la sala. Rapido.', 'es-419')).toEqual(['Codigo', 'Rapido'])
    })
})

/**
 * The false-match suite, and the reason it exists: an earlier rule in this repo matched "loo" as a
 * substring and fired on "floor". Every case below is correct copy that a substring rule fails on.
 */
describe('word boundaries', () => {
    it('does not fire on a longer word that contains a listed form', () => {
        // `nao` inside a word; `facil` inside "facilita"; `como` inside "comodidad".
        expect(found('a Renao facilita a comodidade', 'pt-br')).toEqual([])
        expect(found('facilita la comodidad de los usuarios', 'es-419')).toEqual([])
        // The original bug, transposed: a short form inside a longer, unrelated word.
        expect(found('o cardapio nao', 'pt-br')).toEqual(['nao'])
    })

    it('does not fire on the correctly accented spelling', () => {
        expect(found('o código é fácil e rápido, esse número, você não', 'pt-br')).toEqual([])
        expect(found('el código es fácil y rápido, también ese número', 'es-419')).toEqual([])
    })

    it('ignores a link target, an inline code span and a URL', () => {
        // Slugs and paths stay English by decision, so ASCII inside one is not a dropped accent.
        expect(found('[dividir la cuenta](/split-bill-no-signup#codigo)', 'es-419')).toEqual([])
        expect(found('usa `codigo` como identificador', 'es-419')).toEqual([])
        expect(found('https://peanutsplit.com/es-419/codigo-facil', 'es-419')).toEqual([])
        expect(found('<CTA href="/nao-usuario" text="Comece" />', 'pt-br')).toEqual([])
    })
})

/**
 * The three Spanish words that are correct unaccented in ordinary prose and wrong in front of a
 * question. Banning them outright fails correct copy; ignoring them misses the most common
 * dropped accent on a Spanish page, which is a `## Como funciona` heading.
 */
describe('interrogatives, scoped to where an interrogative stands', () => {
    it('catches an unaccented interrogative opening a heading', () => {
        expect(found('## Como funciona', 'es-419')).toEqual(['Como'])
        expect(found('### Cuanto cuesta', 'es-419')).toEqual(['Cuanto'])
        expect(found('## Quien paga primero', 'es-419')).toEqual(['Quien'])
    })

    it('catches an unaccented interrogative after an opening ¿', () => {
        expect(found('¿Como se divide la cuenta?', 'es-419')).toEqual(['Como'])
    })

    it('leaves the ordinary unaccented reading alone', () => {
        // Comparative "como", relative "quien", and "en cuanto a" — all correct without an accent.
        expect(found('Tan simple como un enlace.', 'es-419')).toEqual([])
        expect(found('La persona quien paga primero.', 'es-419')).toEqual([])
        expect(found('En cuanto a las monedas, hay doce.', 'es-419')).toEqual([])
        // Mid-heading rather than opening it: not the interrogative shape.
        expect(found('## Tan rapido como un enlace'.replace('rapido', 'simple'), 'es-419')).toEqual([])
    })

    it('leaves Portuguese "como" alone, where the unaccented spelling is the correct one', () => {
        expect(found('## Como funciona', 'pt-br')).toEqual([])
        expect(found('## Como dividir a conta', 'pt-br')).toEqual([])
    })
})

/**
 * The mutation test the gate is required to carry: a rule that cannot fail is not a gate.
 *
 * Rather than describing the loop, it runs it — every listed form is injected into an otherwise
 * clean page, the gate must catch it, and the same page without the injection must come back
 * clean. That is the "introduce a violation, confirm it fails, remove it" cycle, once per word,
 * and it fails if any row of the wordlist is unreachable.
 */
describe('mutation', () => {
    const clean = {
        'es-419': '## Cómo funciona\n\nEl código es fácil. También es rápido para el usuario.\n',
        'pt-br': '## Como funciona\n\nO código é fácil. Você não paga pela divisão.\n',
    } as const

    it.each(['es-419', 'pt-br'] as const)('%s: catches every word on its list, and only then', (locale) => {
        // Baseline: the page is clean before anything is introduced.
        expect(found(clean[locale], locale)).toEqual([])

        for (const word of diacriticWordlist(locale)) {
            // An interrogative only counts opening a heading, so inject each word in the position
            // its own rule is about.
            const mutated = `${clean[locale]}\n## ${word} algo\n\nUna línea con ${word} dentro.\n`
            expect(
                found(mutated, locale).length,
                `${locale}: "${word}" is on the list but cannot fail`
            ).toBeGreaterThan(0)
        }

        // And removed again: the gate is clean on the same page without the injections.
        expect(found(clean[locale], locale)).toEqual([])
    })
})
