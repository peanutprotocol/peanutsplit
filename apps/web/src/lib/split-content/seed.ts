/**
 * Deterministic seed mixing for the content engine's visual recipe (fun-engine.md S1).
 *
 * Pure and IO-free: the same slug always hashes to the same number, on the server and in the
 * browser, with no boot seed and nothing to persist. `pageRecipe` (./recipe.ts) is the only
 * consumer that turns this into a page's actual palette/motif decisions.
 */

/** FNV-1a, copied verbatim from avatar-palettes.ts's internal hash() (apps/web/src/lib/avatar-palettes.ts:70-74). */
export function hashSlug(slug: string): number {
    let result = 0x811c9dc5
    for (let index = 0; index < slug.length; index++) {
        result ^= slug.charCodeAt(index)
        result = Math.imul(result, 0x01000193) >>> 0
    }
    return result
}

/**
 * Draws one option index for one decision "channel" on a page. Re-mixing the page seed with the
 * channel name before hashing keeps channels independent — two `pick` calls on the same page with
 * different `channel` strings do not correlate, even though both trace back to the one page seed.
 */
export function pick(seed: number, channel: string, optionCount: number): number {
    return optionCount <= 1 ? 0 : hashSlug(`${seed}:${channel}`) % optionCount
}
