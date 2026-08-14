/**
 * The register governor (fun-engine.md S1/S4): a flat-register page must never render a
 * play-tier component (fun-engine.md Invariants #4 — "no doodles, no play components, no jokes").
 *
 * S1 ships the pure assertion only. `PLAY_TIER_COMPONENT_NAMES` is empty because there is no real
 * play-tier component yet — S4 widens it to `['Script']` once `<Script>` exists, and the spot
 * placer adds doodle placement enforcement on top. Corpus-level enforcement — calling this against
 * the actual rendered MDX component tree — lands with those consumers in S4; register-governor.
 * test.ts exercises the mechanism now against a test-local stub list, passed as the third
 * argument, since a still-empty real list would let this test pass for the wrong reason.
 */

export const PLAY_TIER_COMPONENT_NAMES: readonly string[] = []

export function assertRegisterAllows(
    register: 'default' | 'flat',
    renderedComponentNames: readonly string[],
    playTierComponentNames: readonly string[] = PLAY_TIER_COMPONENT_NAMES
): void {
    if (register !== 'flat') return
    const offender = renderedComponentNames.find((name) => playTierComponentNames.includes(name))
    if (offender) throw new Error(`Flat register page rendered a play-tier component: ${offender}`)
}
