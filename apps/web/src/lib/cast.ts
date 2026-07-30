import { PERSONAS, PERSONA_KEYS, type PersonaKey } from '@/lib/avatars'
import { LANDING_CAST } from '@/components/marketing/LandingPersona'

/**
 * The names an article may put in `<Cast name="…">`.
 *
 * Two vocabularies, one catalog. A page can name the character (`raincoat-duck`) or the role the
 * landing page already casts it in (`ana`), and both resolve to the same drawing — that is the
 * point: the friend group in a guide has to look like the friend group on the landing page, or the
 * cast reads as a stack of unrelated illustrations. Nothing is duplicated here; the artwork,
 * palettes and labels stay in `avatars.ts` and the role map stays in `LandingPersona.tsx`.
 *
 * Deliberately narrower than `AVATARS`. The classics (`doodle-pizza`) are objects, not characters,
 * and the retired and legacy keys are a read-only compatibility shim for member rows that must
 * never be re-offered — an article naming one is a mistake, so it fails the content test.
 *
 * Names are English-only, because `label` and `vibe` in `avatars.ts` are English string literals
 * outside the i18n catalogs. That is fine as long as `<Cast>` never renders the name — see the
 * component. A page that wants to *say* "Raincoat Duck" in Spanish is a translation decision
 * nobody has taken yet.
 */
export type CastRole = keyof typeof LANDING_CAST
export type CastName = PersonaKey | CastRole

const ROLE_KEYS = Object.keys(LANDING_CAST) as CastRole[]

/** Every accepted name, characters first. What the content test lists in its failure message. */
export const CAST_NAMES: readonly CastName[] = [...PERSONA_KEYS, ...ROLE_KEYS]

const CAST_NAME_SET = new Set<string>(CAST_NAMES)

export const isCastName = (value: unknown): value is CastName => typeof value === 'string' && CAST_NAME_SET.has(value)

/**
 * Which persona a name draws. Unknown names come back null rather than throwing: the gate for a
 * typo is `content.test.ts`, and a component that throws would turn a bad character name into a
 * failed production build — the one failure mode the content engine is built to avoid.
 */
export function castPersona(name: string): PersonaKey | null {
    if (name in LANDING_CAST) return LANDING_CAST[name as CastRole]
    return name in PERSONAS ? (name as PersonaKey) : null
}
