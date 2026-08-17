import { DOODLE_NAMES, type DoodleName } from '@/components/ui/doodles'
import type { Chapter } from './chapter-tokens'
import { pick } from './seed'

/**
 * The spot placer (fun-engine.md S4): where a chapter-ink doodle may land in a Steps/Checklist
 * block, and never on a flat-register page (Invariants #4).
 */

const EXPENSE_PREFIX = /^expense_/
const DOODLE_NAME_SET = new Set<string>(DOODLE_NAMES)

/**
 * Keeps only names that are BOTH a real `DOODLE` key AND not one of the 300 `expense_`-prefixed
 * category icons (454 total keys, 154 usable) — enforced here in code rather than trusted to the
 * curation below, so a typo below drops silently instead of shipping a broken doodle name.
 */
function verifiedPool(candidates: readonly string[]): readonly DoodleName[] {
    return candidates.filter((name): name is DoodleName => DOODLE_NAME_SET.has(name) && !EXPENSE_PREFIX.test(name))
}

/** Curated per chapter from the 154 non-`expense_` names — art, not the per-expense icon set. */
export const CHAPTER_DOODLE_POOLS: Record<Chapter, readonly DoodleName[]> = {
    trips: verifiedPool([
        'plane',
        'suitcase',
        'hotel',
        'taxi',
        'train',
        'van',
        'boat',
        'island',
        'mountain',
        'tent',
        'sun',
        'ski',
        'car',
        'fuel',
        'parking',
    ]),
    table: verifiedPool([
        'burger',
        'pizza',
        'cake',
        'coffee',
        'wine',
        'beer',
        'restaurant',
        'sushi',
        'noodles',
        'candy',
        'slice',
        'cart',
        'market',
    ]),
    home: verifiedPool(['house', 'lightbulb', 'teddy', 'dog', 'gift', 'party', 'guitar', 'book', 'phone', 'pill']),
    'getting-paid-back': verifiedPool([
        'iconhandcoins',
        'cash',
        'banknote',
        'bank',
        'iconwallet',
        'tally',
        'iconreceipt',
        'question',
        'shrug',
    ]),
    currencies: verifiedPool([
        'baht',
        'cedi',
        'colon',
        'dollar',
        'dong',
        'euro',
        'forint',
        'franc',
        'guarani',
        'guilder',
        'hryvnia',
        'kip',
        'koruna',
        'krona',
        'lira',
        'naira',
        'peso',
        'piso',
        'pound',
        'rand',
        'real',
        'ringgit',
        'ruble',
        'rupee',
        'rupiah',
        'shekel',
        'shilling',
        'tenge',
        'tugrik',
        'won',
        'yen',
        'zloty',
        'globe',
        'swap',
    ]),
    versus: verifiedPool([
        'iconarrowleft',
        'iconarrowright',
        'iconx',
        'iconcheck',
        'icontrash',
        'iconundo',
        'swap',
        'question',
        'pulse',
        'shrug',
        'iconchevrondown',
        'iconchevronright',
        'iconchevronup',
    ]),
}

/** The doodle name a chosen index draws, deterministic per page and per index within it. */
export function spotDoodle(seed: number, chapter: Chapter, index: number): DoodleName {
    const pool = CHAPTER_DOODLE_POOLS[chapter]
    return pool[pick(seed, `spot-doodle:${index}`, pool.length)]
}

/**
 * Which child indices (0-based, within one Steps/Checklist block) get a doodle.
 *
 * `register` is REQUIRED, not a documented convention a caller might forget: a flat-register page
 * gets `[]` unconditionally, before the seed or chapter are ever consulted (Invariants #4 — "no
 * doodles, no play components, no jokes"). Roughly one doodle per three sections stands in for
 * fun-engine.md's "~1 per 450 words" — this function only sees a section count, not a word count —
 * capped at 5, and never two adjacent indices so two doodles never crowd next to each other.
 */
export function spotPlan(seed: number, chapter: Chapter, sectionCount: number, register: 'default' | 'flat'): number[] {
    if (register === 'flat' || sectionCount <= 0) return []

    const targetCount = Math.min(5, Math.ceil(sectionCount / 3))
    const available = Array.from({ length: sectionCount }, (_, index) => index)
    const spots: number[] = []

    while (spots.length < targetCount && available.length > 0) {
        const draw = pick(seed, `spot:${chapter}:${spots.length}`, available.length)
        const chosen = available[draw]
        spots.push(chosen)
        // Never two in a section: drop the pick and its immediate neighbours from what is left.
        for (let index = available.length - 1; index >= 0; index--) {
            if (Math.abs(available[index] - chosen) <= 1) available.splice(index, 1)
        }
    }

    return spots.sort((a, b) => a - b)
}
