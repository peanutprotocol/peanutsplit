import { describe, expect, it } from 'vitest'

import {
    EXPENSE_CATEGORIES,
    EXPENSE_CATEGORY_IDS,
    matchExpenseCategory,
    normalizeExpenseCategoryText,
} from './expense-category'

describe('expense category catalog', () => {
    it('has 40 stable categories and 1,000 unique normalized terms', () => {
        const terms = EXPENSE_CATEGORIES.flatMap((category) => category.terms)
        const normalizedTerms = terms.map(normalizeExpenseCategoryText)

        expect(EXPENSE_CATEGORIES).toHaveLength(40)
        expect(EXPENSE_CATEGORIES.map((category) => category.id)).toEqual(EXPENSE_CATEGORY_IDS)
        expect(EXPENSE_CATEGORIES.every((category) => category.terms.length === 25)).toBe(true)
        expect(terms).toHaveLength(1_000)
        expect(new Set(normalizedTerms).size).toBe(1_000)
    })
})

describe('matchExpenseCategory', () => {
    it.each([
        ['Friday night pizza delivery', 'pizza'],
        ['Dinner at the bistro', 'restaurants'],
        ['pad thai and noodles', 'asian-food'],
        ['mercado do mês', 'groceries'],
        ['posto de gasolina', 'fuel'],
        ['Uber home', 'taxi-rides'],
        ['billete de ferry', 'boats-ferries'],
        ['hotel in Lisboa', 'accommodation'],
        ['aluguel mensal', 'rent-home'],
        ['conta de luz', 'utilities'],
        ['saúde', 'health'],
        ['farmácia', 'pharmacy'],
        ['creche', 'childcare'],
        ['bank fee', 'banking-fees'],
        ['doação', 'charity'],
    ])('classifies “%s” as %s', (description, categoryId) => {
        expect(matchExpenseCategory(description).category.id).toBe(categoryId)
    })

    it('prefers a specific phrase over a shorter overlapping word', () => {
        const match = matchExpenseCategory('Gas bill for the flat')

        expect(match.category.id).toBe('utilities')
        expect(match.matchedTerm).toBe('gas bill')
        expect(match.rule).toBe('phrase')
    })

    it('normalizes punctuation, casing and accents', () => {
        expect(matchExpenseCategory('  RECARGA—ELÉTRICA!! ').category.id).toBe('fuel')
        expect(matchExpenseCategory('Porción de PIZZA').category.id).toBe('pizza')
    })

    it('matches whole terms rather than arbitrary substrings', () => {
        expect(matchExpenseCategory('gastronomy').category.id).toBe('other')
    })

    it('falls back to other for empty and unknown descriptions', () => {
        expect(matchExpenseCategory('').rule).toBe('fallback')
        expect(matchExpenseCategory('quarterly telescope polish').category.id).toBe('other')
    })
})
