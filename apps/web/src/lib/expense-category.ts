import expenseCategoryCatalogJson from './expense-category-catalog.json'

import { isDoodleName, type DoodleName } from '@/components/ui/doodles'

export const EXPENSE_CATEGORY_IDS = [
    'pizza',
    'restaurants',
    'asian-food',
    'sushi',
    'groceries',
    'coffee-breakfast',
    'desserts-snacks',
    'drinks-nightlife',
    'fuel',
    'taxi-rides',
    'public-transit',
    'flights',
    'parking-tolls',
    'car-hire',
    'boats-ferries',
    'accommodation',
    'rent-home',
    'holidays-trips',
    'beach-water',
    'outdoors-camping',
    'snow-sports',
    'shopping',
    'gifts',
    'entertainment',
    'music-events',
    'parties',
    'sports-fitness',
    'pets',
    'phone-internet',
    'utilities',
    'health',
    'pharmacy',
    'education',
    'childcare',
    'cash',
    'banking-fees',
    'bills-receipts',
    'transfers',
    'charity',
    'other',
] as const

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORY_IDS)[number]

export const EXPENSE_CATEGORY_GROUPS = [
    'Food & drink',
    'Getting around',
    'Trips & stays',
    'Everyday life',
    'Care & family',
    'Money & admin',
] as const

export type ExpenseCategoryGroup = (typeof EXPENSE_CATEGORY_GROUPS)[number]

export interface ExpenseCategory {
    readonly id: ExpenseCategoryId
    readonly label: string
    readonly group: ExpenseCategoryGroup
    readonly doodle: DoodleName
    readonly terms: readonly string[]
}

export interface ExpenseCategoryMatch {
    readonly category: ExpenseCategory
    readonly matchedTerm: string | null
    readonly rule: 'exact' | 'phrase' | 'word' | 'fallback'
}

const categoryIds = new Set<string>(EXPENSE_CATEGORY_IDS)
const categoryGroups = new Set<string>(EXPENSE_CATEGORY_GROUPS)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const normalizeExpenseCategoryText = (value: string): string =>
    value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('en')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()

const readCatalog = (value: unknown): readonly ExpenseCategory[] => {
    if (!Array.isArray(value) || value.length !== 40) {
        throw new Error('Expense categories must contain exactly 40 entries')
    }

    const seenIds = new Set<string>()
    const seenTerms = new Set<string>()
    const categories = value.map((entry, index): ExpenseCategory => {
        if (!isRecord(entry)) {
            throw new Error(`Expense category ${index + 1} must be an object`)
        }

        const { id, label, group, doodle, terms } = entry
        if (typeof id !== 'string' || !categoryIds.has(id) || seenIds.has(id)) {
            throw new Error(`Invalid or duplicate expense category id: ${String(id)}`)
        }
        if (typeof label !== 'string' || label.trim().length === 0) {
            throw new Error(`Expense category ${id} needs a label`)
        }
        if (typeof group !== 'string' || !categoryGroups.has(group)) {
            throw new Error(`Expense category ${id} has an invalid group`)
        }
        if (typeof doodle !== 'string' || !isDoodleName(doodle)) {
            throw new Error(`Expense category ${id} has an unknown doodle: ${String(doodle)}`)
        }
        if (!Array.isArray(terms) || terms.length !== 25 || !terms.every((term) => typeof term === 'string')) {
            throw new Error(`Expense category ${id} must contain exactly 25 terms`)
        }

        const cleanTerms = terms.map((term) => term.trim())
        for (const term of cleanTerms) {
            const normalized = normalizeExpenseCategoryText(term)
            if (!normalized || seenTerms.has(normalized)) {
                throw new Error(`Invalid or duplicate expense category term: ${term}`)
            }
            seenTerms.add(normalized)
        }
        seenIds.add(id)

        return Object.freeze({
            id: id as ExpenseCategoryId,
            label,
            group: group as ExpenseCategoryGroup,
            doodle,
            terms: Object.freeze(cleanTerms),
        })
    })

    if (seenIds.size !== EXPENSE_CATEGORY_IDS.length || seenTerms.size !== 1_000) {
        throw new Error('Expense category catalog is incomplete')
    }

    return Object.freeze(categories)
}

export const EXPENSE_CATEGORIES = readCatalog(expenseCategoryCatalogJson)

const categoryById = new Map(EXPENSE_CATEGORIES.map((category) => [category.id, category]))
const fallbackCategory = categoryById.get('other')

if (!fallbackCategory) {
    throw new Error('Expense category catalog needs an other fallback')
}

interface IndexedTerm {
    readonly category: ExpenseCategory
    readonly normalized: string
    readonly source: string
    readonly wordCount: number
}

const indexedTerms: readonly IndexedTerm[] = EXPENSE_CATEGORIES.flatMap((category) =>
    category.terms.map((source) => {
        const normalized = normalizeExpenseCategoryText(source)
        return {
            category,
            normalized,
            source,
            wordCount: normalized.split(' ').length,
        }
    })
)

const exactTerms = new Map(indexedTerms.map((term) => [term.normalized, term]))

export const getExpenseCategory = (id: ExpenseCategoryId): ExpenseCategory => {
    const category = categoryById.get(id)
    if (!category) {
        throw new Error(`Unknown expense category: ${id}`)
    }
    return category
}

export const matchExpenseCategory = (description: string): ExpenseCategoryMatch => {
    const normalizedDescription = normalizeExpenseCategoryText(description)
    if (!normalizedDescription) {
        return { category: fallbackCategory, matchedTerm: null, rule: 'fallback' }
    }

    const exact = exactTerms.get(normalizedDescription)
    if (exact) {
        return { category: exact.category, matchedTerm: exact.source, rule: 'exact' }
    }

    const paddedDescription = ` ${normalizedDescription} `
    let best: { term: IndexedTerm; position: number } | undefined

    for (const term of indexedTerms) {
        const position = paddedDescription.indexOf(` ${term.normalized} `)
        if (position < 0) continue

        const isBetter =
            !best ||
            term.wordCount > best.term.wordCount ||
            (term.wordCount === best.term.wordCount && term.normalized.length > best.term.normalized.length) ||
            (term.wordCount === best.term.wordCount &&
                term.normalized.length === best.term.normalized.length &&
                position < best.position)

        if (isBetter) best = { term, position }
    }

    if (!best) {
        return { category: fallbackCategory, matchedTerm: null, rule: 'fallback' }
    }

    return {
        category: best.term.category,
        matchedTerm: best.term.source,
        rule: best.term.wordCount > 1 ? 'phrase' : 'word',
    }
}
