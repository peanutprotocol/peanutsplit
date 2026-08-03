import { distance } from 'fastest-levenshtein'

import expenseCatalogJson from './expense-category-catalog.json'

import { isDoodleName, type DoodleName } from '@/components/ui/doodles'

export const EXPENSE_CATEGORY_IDS = [
    'food-drink',
    'transport',
    'travel-stays',
    'home-bills',
    'shopping',
    'entertainment-leisure',
    'health-wellness',
    'family-education',
    'work-services',
    'tech-connectivity',
    'money-admin',
    'gifts-giving',
    'other',
] as const

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORY_IDS)[number]

export interface ExpenseCategory {
    readonly id: ExpenseCategoryId
    readonly label: string
}

export interface ExpenseSubject {
    readonly id: string
    readonly label: string
    readonly categoryId: ExpenseCategoryId
    readonly doodle: DoodleName
    readonly terms: readonly string[]
}

export interface ExpenseCategoryMatch {
    readonly category: ExpenseCategory
    readonly subject: ExpenseSubject
    readonly matchedTerm: string | null
    readonly rule: 'exact' | 'phrase' | 'word' | 'typo' | 'fallback'
    readonly editDistance: number | null
}

const categoryIds = new Set<string>(EXPENSE_CATEGORY_IDS)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const normalizeExpenseCategoryText = (value: string): string =>
    value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('en')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()

const readCatalog = (
    value: unknown
): { categories: readonly ExpenseCategory[]; subjects: readonly ExpenseSubject[] } => {
    if (!isRecord(value) || !Array.isArray(value.categories) || !Array.isArray(value.subjects)) {
        throw new Error('Expense catalog must contain categories and subjects')
    }
    if (value.categories.length !== 13 || value.subjects.length !== 340) {
        throw new Error('Expense catalog must contain 13 categories and 340 subjects')
    }

    const seenCategoryIds = new Set<string>()
    const categories = value.categories.map((entry, index): ExpenseCategory => {
        if (!isRecord(entry)) throw new Error(`Expense category ${index + 1} must be an object`)
        const { id, label } = entry
        if (typeof id !== 'string' || !categoryIds.has(id) || seenCategoryIds.has(id)) {
            throw new Error(`Invalid or duplicate expense category id: ${String(id)}`)
        }
        if (typeof label !== 'string' || !label.trim()) throw new Error(`Expense category ${id} needs a label`)
        seenCategoryIds.add(id)
        return Object.freeze({ id: id as ExpenseCategoryId, label })
    })

    if (
        categories.some((category, index) => category.id !== EXPENSE_CATEGORY_IDS[index]) ||
        seenCategoryIds.size !== EXPENSE_CATEGORY_IDS.length
    ) {
        throw new Error('Expense category order or coverage is incomplete')
    }

    const seenSubjectIds = new Set<string>()
    const seenDoodles = new Set<string>()
    const seenTerms = new Set<string>()
    const subjects = value.subjects.map((entry, index): ExpenseSubject => {
        if (!isRecord(entry)) throw new Error(`Expense subject ${index + 1} must be an object`)
        const { id, label, categoryId, doodle, terms } = entry
        if (typeof id !== 'string' || !id || seenSubjectIds.has(id)) {
            throw new Error(`Invalid or duplicate expense subject id: ${String(id)}`)
        }
        if (typeof label !== 'string' || !label.trim()) throw new Error(`Expense subject ${id} needs a label`)
        if (typeof categoryId !== 'string' || !categoryIds.has(categoryId)) {
            throw new Error(`Expense subject ${id} has an invalid category`)
        }
        if (typeof doodle !== 'string' || !isDoodleName(doodle) || seenDoodles.has(doodle)) {
            throw new Error(`Expense subject ${id} has an invalid or duplicate doodle: ${String(doodle)}`)
        }
        if (!Array.isArray(terms) || !terms.length || !terms.every((term) => typeof term === 'string')) {
            throw new Error(`Expense subject ${id} needs matching terms`)
        }

        const cleanTerms = terms.map((term) => term.trim())
        for (const term of cleanTerms) {
            const normalized = normalizeExpenseCategoryText(term)
            if (!normalized || seenTerms.has(normalized)) {
                throw new Error(`Invalid or duplicate expense term: ${term}`)
            }
            seenTerms.add(normalized)
        }
        seenSubjectIds.add(id)
        seenDoodles.add(doodle)
        return Object.freeze({
            id,
            label,
            categoryId: categoryId as ExpenseCategoryId,
            doodle,
            terms: Object.freeze(cleanTerms),
        })
    })

    const importedDoodles = subjects.filter((subject) => subject.doodle.startsWith('expense_')).length
    if (seenTerms.size !== 2_000 || importedDoodles !== 300) {
        throw new Error('Expense subject coverage must contain 2,000 terms and 300 imported doodles')
    }

    return { categories: Object.freeze(categories), subjects: Object.freeze(subjects) }
}

const catalog = readCatalog(expenseCatalogJson)

export const EXPENSE_CATEGORIES = catalog.categories
export const EXPENSE_SUBJECTS = catalog.subjects

const categoryById = new Map(EXPENSE_CATEGORIES.map((category) => [category.id, category]))
const subjectById = new Map(EXPENSE_SUBJECTS.map((subject) => [subject.id, subject]))
const fallbackCategory = categoryById.get('other')
const fallbackSubject = subjectById.get('other')

if (!fallbackCategory || !fallbackSubject) throw new Error('Expense catalog needs an Other fallback')

interface IndexedTerm {
    readonly category: ExpenseCategory
    readonly subject: ExpenseSubject
    readonly normalized: string
    readonly source: string
    readonly wordCount: number
}

const explicitTerms: readonly IndexedTerm[] = EXPENSE_SUBJECTS.flatMap((subject) => {
    const category = categoryById.get(subject.categoryId)
    if (!category) throw new Error(`Missing category for expense subject ${subject.id}`)
    return subject.terms.map((source) => {
        const normalized = normalizeExpenseCategoryText(source)
        return { category, subject, normalized, source, wordCount: normalized.split(' ').length }
    })
})

const claimedTerms = new Set(explicitTerms.map((term) => term.normalized))
const labelTerms: readonly IndexedTerm[] = EXPENSE_SUBJECTS.flatMap((subject) => {
    const normalized = normalizeExpenseCategoryText(subject.label)
    if (!normalized || claimedTerms.has(normalized)) return []
    const category = categoryById.get(subject.categoryId)
    if (!category) throw new Error(`Missing category for expense subject ${subject.id}`)
    claimedTerms.add(normalized)
    return [{ category, subject, normalized, source: subject.label, wordCount: normalized.split(' ').length }]
})

const indexedTerms: readonly IndexedTerm[] = [...explicitTerms, ...labelTerms]

const exactTerms = new Map(indexedTerms.map((term) => [term.normalized, term]))

export const getExpenseCategory = (id: ExpenseCategoryId): ExpenseCategory => {
    const category = categoryById.get(id)
    if (!category) throw new Error(`Unknown expense category: ${id}`)
    return category
}

export const getExpenseSubject = (id: string): ExpenseSubject => {
    const subject = subjectById.get(id)
    if (!subject) throw new Error(`Unknown expense subject: ${id}`)
    return subject
}

const fallbackMatch = (): ExpenseCategoryMatch => ({
    category: fallbackCategory,
    subject: fallbackSubject,
    matchedTerm: null,
    rule: 'fallback',
    editDistance: null,
})

const allowedEditDistance = (value: string): number => {
    const length = value.replaceAll(' ', '').length
    if (length < 4) return 0
    if (length <= 5) return 1
    if (length <= 9) return 2
    if (length <= 15) return 3
    return 4
}

interface TypoCandidate {
    readonly term: IndexedTerm
    readonly edits: number
    readonly ratio: number
    readonly position: number
}

const typoMatch = (description: string): ExpenseCategoryMatch | undefined => {
    const words = description.split(' ')
    const windows = new Map<number, readonly { value: string; position: number }[]>()
    const windowsFor = (wordCount: number): readonly { value: string; position: number }[] => {
        const cached = windows.get(wordCount)
        if (cached) return cached
        const built = Array.from({ length: Math.max(0, words.length - wordCount + 1) }, (_, position) => ({
            value: words.slice(position, position + wordCount).join(' '),
            position,
        }))
        windows.set(wordCount, built)
        return built
    }

    const candidates: TypoCandidate[] = []
    for (const term of indexedTerms) {
        const allowed = allowedEditDistance(term.normalized)
        if (!allowed) continue
        for (const window of windowsFor(term.wordCount)) {
            if (Math.abs(window.value.length - term.normalized.length) > allowed) continue
            const edits = distance(window.value, term.normalized)
            const ratio = edits / Math.max(window.value.length, term.normalized.length)
            if (edits <= allowed && ratio <= 0.25) {
                candidates.push({ term, edits, ratio, position: window.position })
            }
        }
    }

    candidates.sort(
        (left, right) =>
            left.edits - right.edits ||
            left.ratio - right.ratio ||
            right.term.wordCount - left.term.wordCount ||
            right.term.normalized.length - left.term.normalized.length ||
            left.position - right.position
    )
    const best = candidates[0]
    if (!best) return undefined

    const ambiguous = candidates.some(
        (candidate) =>
            candidate !== best &&
            candidate.term.subject.id !== best.term.subject.id &&
            candidate.edits === best.edits &&
            candidate.ratio === best.ratio &&
            candidate.term.wordCount === best.term.wordCount &&
            candidate.term.normalized.length === best.term.normalized.length
    )
    if (ambiguous) return undefined

    return {
        category: best.term.category,
        subject: best.term.subject,
        matchedTerm: best.term.source,
        rule: 'typo',
        editDistance: best.edits,
    }
}

export const matchExpenseCategory = (description: string): ExpenseCategoryMatch => {
    const normalizedDescription = normalizeExpenseCategoryText(description)
    if (!normalizedDescription) return fallbackMatch()

    const exact = exactTerms.get(normalizedDescription)
    if (exact) {
        return {
            category: exact.category,
            subject: exact.subject,
            matchedTerm: exact.source,
            rule: 'exact',
            editDistance: 0,
        }
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

    if (best) {
        return {
            category: best.term.category,
            subject: best.term.subject,
            matchedTerm: best.term.source,
            rule: best.term.wordCount > 1 ? 'phrase' : 'word',
            editDistance: 0,
        }
    }

    return typoMatch(normalizedDescription) ?? fallbackMatch()
}
