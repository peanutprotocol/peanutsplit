/**
 * The register governor (fun-engine.md S1/S4): a flat-register page must never render a
 * play-tier component (fun-engine.md Invariants #4 — "no doodles, no play components, no jokes").
 *
 * `PLAY_TIER_COMPONENT_NAMES` now lists `<Script>`, the one play-tier component that exists
 * (fun-engine.md S4). Doodle placement is enforced separately, by `spotPlan` returning `[]` for a
 * flat page rather than by this list — see `flat-register.test.ts`, which is the corpus-level
 * enforcement test for both mechanisms together — vacuous while `FLAT_REGISTER_SLUGS` is empty.
 */

export const PLAY_TIER_COMPONENT_NAMES: readonly string[] = ['Script']

export function assertRegisterAllows(
    register: 'default' | 'flat',
    renderedComponentNames: readonly string[],
    playTierComponentNames: readonly string[] = PLAY_TIER_COMPONENT_NAMES
): void {
    if (register !== 'flat') return
    const offender = renderedComponentNames.find((name) => playTierComponentNames.includes(name))
    if (offender) throw new Error(`Flat register page rendered a play-tier component: ${offender}`)
}
