import type { CSSProperties } from 'react'
import { Doodle } from '@/components/ui/Doodle'
import { avatarArt, type PersonaKey } from '@/lib/avatars'
import { cn } from '@/lib/cn'

/**
 * The recurring cast used by the landing story.
 *
 * These keys point at the reviewed persona catalog shared with real member
 * avatars. Keeping one cast makes the link handoff, proof scenes and FAQ feel
 * like the same group rather than a stack of unrelated illustrations.
 */
export const LANDING_CAST = {
    bea: 'party-bee',
    jules: 'wizard-frog',
    mo: 'moon-bunny',
    you: 'pocket-robot',
    ana: 'raincoat-duck',
    konrad: 'astronaut-avocado',
    hugo: 'disco-octopus',
    lisbon: 'pirate-parrot',
    flat: 'cozy-ghost',
    dinner: 'pancake-bear',
    retreat: 'garden-yeti',
} as const satisfies Record<string, PersonaKey>

/**
 * A decorative, color-complete persona portrait.
 *
 * Size is optional so compact contexts such as the Messenger can keep their
 * responsive CSS. Supplying it gives proof and team cards an exact layout box.
 */
export function LandingPersona({
    persona,
    size,
    className,
}: {
    persona: PersonaKey
    size?: number
    className?: string
}) {
    const art = avatarArt(persona)
    const dimensions = size ? { width: size, height: size } : {}

    return (
        <span
            data-persona={persona}
            aria-hidden="true"
            className={cn('landing-persona', className)}
            style={{ ...dimensions, background: art.background, color: art.ink } as CSSProperties}
        >
            <span className="landing-persona-accent" style={{ background: art.accent }} />
            <Doodle name={art.doodle} size={size ? Math.round(size * 0.78) : 24} weight={1.7} />
        </span>
    )
}

export default LandingPersona
