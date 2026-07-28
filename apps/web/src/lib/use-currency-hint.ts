'use client'

/**
 * Everything the currency guess needs from the device: the two signals it reads, and the one
 * thing it must never override.
 *
 * `currency-hint.ts` is pure; this is the impure half, kept small and in one place so the
 * ranking stays testable with fixtures instead of a mocked `navigator`.
 *
 * The hint arrives **after** mount, never during render. `Intl` and `navigator` do not exist on
 * the server, so seeding state with a guess renders one currency on the server and a different
 * one in the browser — React flags the mismatch and then refuses to patch it up. Same reason the
 * room emoji is rolled in an effect.
 */

import { useEffect, useState } from 'react'
import { rankCurrencyCandidates, type CurrencyCandidate } from './currency-hint'

/** Stable identity so the array can sit in a dependency list without re-firing every render. */
const NO_HINTS: readonly CurrencyCandidate[] = []

function deviceTimeZone(): string | null {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
    } catch {
        // An engine without a full ICU build. The language signal still works.
        return null
    }
}

function deviceLanguages(): readonly string[] {
    if (typeof navigator === 'undefined') return []
    // `languages` is the ranked list the user actually configured; `language` is the single
    // top entry and is the only thing older Safari exposes.
    return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : []
}

/** Empty on the server and on the first client paint, then the ranked guess. */
export function useCurrencyHints(): readonly CurrencyCandidate[] {
    const [hints, setHints] = useState<readonly CurrencyCandidate[]>(NO_HINTS)

    useEffect(() => {
        setHints(rankCurrencyCandidates({ timeZone: deviceTimeZone(), languages: deviceLanguages() }))
    }, [])

    return hints
}

/**
 * A currency the user picked by hand, remembered for this tab only.
 *
 * `sessionStorage`, not `localStorage`, on purpose: the hint is about *where you are right now*.
 * Someone who overrode the guess to ARS on a trip to Buenos Aires should not have their next
 * room — opened in Bangkok six months later — silently proposing pesos. A traveller's next trip
 * deserves a fresh guess; the only thing worth carrying is the correction they just made, so
 * that going back to create a second room in the same sitting does not re-guess at them.
 */
const CHOICE_KEY = 'ps:currency-choice'

export function readCurrencyChoice(): string | null {
    try {
        return window.sessionStorage.getItem(CHOICE_KEY)
    } catch {
        // Private-mode Safari, or storage blocked outright. No memory is not an error.
        return null
    }
}

export function rememberCurrencyChoice(code: string): void {
    try {
        window.sessionStorage.setItem(CHOICE_KEY, code)
    } catch {
        // The choice still applies to the form in front of them.
    }
}
