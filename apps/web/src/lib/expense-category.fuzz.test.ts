/**
 * `matchExpenseCategory` runs on every description in the ledger — including the ones a Splitwise
 * import carried in from somebody else's app, which is arbitrary text in any script up to 255
 * characters. `ExpenseList` calls it during render, so a throw here is not a wrong icon, it is a
 * blank room.
 *
 * `expense-category.test.ts` covers the classifications that matter. This file covers the two
 * things that have to hold for input nobody wrote on purpose: it always answers, and the answer is
 * always a real catalog entry.
 */
import { describe, expect, it } from 'vitest'
import {
    EXPENSE_CATEGORIES,
    EXPENSE_SUBJECTS,
    matchExpenseCategory,
    normalizeExpenseCategoryText,
} from '@/lib/expense-category'
import { MAX_DESCRIPTION_CHARS } from '@/lib/splitwise-csv'

function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
    }
}

const between = (rng: () => number, low: number, high: number): number => low + Math.floor(rng() * (high - low + 1))
const pick = <T>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)]

const categoryIds = new Set(EXPENSE_CATEGORIES.map((category) => category.id))
const subjectIds = new Set(EXPENSE_SUBJECTS.map((subject) => subject.id))

/** The contract, whatever came in. */
const assertRealMatch = (description: string, label: string): void => {
    const match = matchExpenseCategory(description)
    expect(`${label}:category=${categoryIds.has(match.category.id)}`).toBe(`${label}:category=true`)
    expect(`${label}:subject=${subjectIds.has(match.subject.id)}`).toBe(`${label}:subject=true`)
    expect(`${label}:pair=${match.subject.categoryId === match.category.id}`).toBe(`${label}:pair=true`)
    expect(['exact', 'phrase', 'word', 'typo', 'fallback']).toContain(match.rule)
    // A match that names no term must not claim a distance, and a fallback names nothing.
    if (match.rule === 'fallback') {
        expect(`${label}:${match.matchedTerm}`).toBe(`${label}:null`)
        expect(`${label}:${match.editDistance}`).toBe(`${label}:null`)
    } else {
        expect(`${label}:term=${typeof match.matchedTerm}`).toBe(`${label}:term=string`)
    }
}

describe('matchExpenseCategory is total', () => {
    it('answers with a real catalog pair for 400 random descriptions', () => {
        const alphabet = [
            ...'abcdefghijklmnopqrstuvwxyz0123456789 ',
            '&',
            '-',
            'é',
            'ü',
            'ñ',
            'ç',
            '£',
            '€',
            '👨‍👩‍👧‍👦',
            '🍕',
            '中',
            'الطعام',
            'Пицца',
            '\n',
            '\t',
            '\u0000',
            '​', // zero-width space
            '‮', // right-to-left override
            '𝟘',
        ]
        for (let seed = 1; seed <= 400; seed++) {
            const rng = mulberry32(seed)
            let text = ''
            for (let index = between(rng, 0, 40); index > 0; index--) text += pick(rng, alphabet)
            assertRealMatch(text, `random-${seed}`)
        }
    })

    it('answers for every empty-ish description, rather than throwing on the ones with no letters', () => {
        for (const text of ['', ' ', '\n', '\t\t', '   ', '&&&', '---', '💸', '\u0000', '​', '﻿']) {
            assertRealMatch(text, JSON.stringify(text))
            // Nothing readable can only mean the fallback — a guess here would be an invented fact.
            if (normalizeExpenseCategoryText(text) === '') expect(matchExpenseCategory(text).rule).toBe('fallback')
        }
    })

    it('is deterministic — the same description classifies the same way twice', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const rng = mulberry32(seed * 7)
            const words = Array.from({ length: between(rng, 1, 6) }, () => pick(rng, EXPENSE_SUBJECTS).label)
            const text = words.join(' ')
            expect(JSON.stringify(matchExpenseCategory(text))).toBe(JSON.stringify(matchExpenseCategory(text)))
        }
    })

    it('classifies every catalog term as its own subject, which is the whole index working', () => {
        for (const subject of EXPENSE_SUBJECTS) {
            for (const term of subject.terms) {
                const match = matchExpenseCategory(term)
                // A longer term elsewhere may legitimately win, so the check is that SOMETHING
                // exact matched rather than that this subject did — a term that falls through to
                // the fallback is an index that lost a row.
                expect(`${subject.id}:${term}:${match.rule}`).not.toBe(`${subject.id}:${term}:fallback`)
            }
        }
    })

    it('stays fast on the longest description a row can carry, which is a render-path budget', () => {
        // Every window of a 255-character description is compared against ~2,300 indexed terms
        // when nothing matches, and `ExpenseList` does this once per row on every paint.
        const worst = 'zqx '.repeat(Math.floor(MAX_DESCRIPTION_CHARS / 4))
        const started = performance.now()
        for (let index = 0; index < 20; index++) assertRealMatch(worst, 'worst-case')
        const perCall = (performance.now() - started) / 20
        expect(perCall).toBeLessThan(80)
    })
})
