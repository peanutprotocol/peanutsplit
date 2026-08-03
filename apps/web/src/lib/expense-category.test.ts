import { describe, expect, it } from 'vitest'

import {
    EXPENSE_CATEGORIES,
    EXPENSE_CATEGORY_IDS,
    EXPENSE_SUBJECTS,
    matchExpenseCategory,
    normalizeExpenseCategoryText,
} from './expense-category'

describe('expense catalog', () => {
    it('has 13 broad categories, 340 subjects and 2,000 unique terms', () => {
        const terms = EXPENSE_SUBJECTS.flatMap((subject) => subject.terms)
        const normalizedTerms = terms.map(normalizeExpenseCategoryText)

        expect(EXPENSE_CATEGORIES).toHaveLength(13)
        expect(EXPENSE_CATEGORIES.map((category) => category.id)).toEqual(EXPENSE_CATEGORY_IDS)
        expect(EXPENSE_SUBJECTS).toHaveLength(340)
        expect(terms).toHaveLength(2_000)
        expect(new Set(normalizedTerms).size).toBe(2_000)
    })

    it('adds 300 distinct transparent doodle subjects', () => {
        const imported = EXPENSE_SUBJECTS.filter((subject) => subject.doodle.startsWith('expense_'))

        expect(imported).toHaveLength(300)
        expect(new Set(imported.map((subject) => subject.doodle)).size).toBe(300)
    })
})

describe('matchExpenseCategory', () => {
    it.each([
        ['Friday night pizza delivery', 'pizza', 'food-drink'],
        ['Dinner at the bistro', 'restaurants', 'food-drink'],
        ['pad thai and noodles', 'asian-food', 'food-drink'],
        ['posto de gasolina', 'fuel', 'transport'],
        ['train ticket', 'public-transit', 'transport'],
        ['bus ticket', 'coach-bus', 'transport'],
        ['billete de ferry', 'boats-ferries', 'transport'],
        ['hotel in Lisboa', 'accommodation', 'travel-stays'],
        ['conta de luz', 'utilities', 'home-bills'],
        ['saúde', 'health', 'health-wellness'],
        ['farmácia', 'pharmacy', 'health-wellness'],
        ['creche', 'childcare', 'family-education'],
        ['bank fee', 'banking-fees', 'money-admin'],
        ['doação', 'charity', 'gifts-giving'],
        ['ticket', 'generic-ticket', 'entertainment-leisure'],
        ['sim', 'sim-card', 'tech-connectivity'],
    ])('classifies “%s” as %s inside %s', (description, subjectId, categoryId) => {
        const match = matchExpenseCategory(description)
        expect(match.subject.id).toBe(subjectId)
        expect(match.category.id).toBe(categoryId)
    })

    it.each([
        ['piza delivery', 'pizza'],
        ['restuarant', 'restaurants'],
        ['tiket', 'generic-ticket'],
        ['accomodation', 'accommodation'],
        ['pharamcy', 'pharmacy'],
    ])('recovers the typo in “%s”', (description, subjectId) => {
        const match = matchExpenseCategory(description)
        expect(match.subject.id).toBe(subjectId)
        expect(match.rule).toBe('typo')
        expect(match.editDistance).toBeGreaterThan(0)
    })

    it('prefers a specific phrase over a shorter overlapping word', () => {
        const match = matchExpenseCategory('Gas bill for the flat')

        expect(match.subject.id).toBe('utilities')
        expect(match.matchedTerm).toBe('gas bill')
        expect(match.rule).toBe('phrase')
    })

    it('normalizes punctuation, casing and accents', () => {
        expect(matchExpenseCategory('  RECARGA—ELÉTRICA!! ').subject.id).toBe('fuel')
        expect(matchExpenseCategory('Porción de PIZZA').subject.id).toBe('pizza')
    })

    it('matches whole terms rather than arbitrary substrings', () => {
        expect(matchExpenseCategory('gastronomy').subject.id).toBe('other')
    })

    it('does not guess ambiguous very short typos', () => {
        expect(matchExpenseCategory('smi').subject.id).toBe('other')
    })

    it('falls back to Other for empty and unknown descriptions', () => {
        expect(matchExpenseCategory('').rule).toBe('fallback')
        expect(matchExpenseCategory('ultraviolet marmalade').subject.id).toBe('other')
    })
})
