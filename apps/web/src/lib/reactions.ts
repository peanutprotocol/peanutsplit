/**
 * The reaction emoji allowlist.
 *
 * Six, fixed, in code. An open emoji field looks like one line of schema and is
 * actually a Unicode validation swamp — ZWJ sequences, skin-tone modifiers,
 * variation selectors, regional-indicator pairs, and a "length" that depends on
 * which of four definitions you pick — sitting on an unauthenticated surface
 * with no moderation channel. A closed set is validated by an `includes` on both
 * sides, renders identically everywhere, and can never carry a payload.
 *
 * The six are chosen to cover what a group chat actually does about money: the
 * spend was wild, it was funny, it hurt, gratitude, applause, and cash.
 *
 * No 'use client' — the server route validates against this list and the picker
 * strip renders from it, and there must be exactly one list.
 */
export const REACTION_EMOJIS = ['🔥', '😂', '😭', '🫶', '👏', '🤑'] as const

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

export const isReactionEmoji = (value: unknown): value is ReactionEmoji =>
    typeof value === 'string' && (REACTION_EMOJIS as readonly string[]).includes(value)

export interface ReactionGroup {
    emoji: ReactionEmoji
    count: number
    /** True when the reader is one of the people in `count`. */
    mine: boolean
}

/**
 * Wire rows → the pills a row renders. Ordered by the allowlist rather than by
 * count, so a pill never jumps sideways under the finger about to tap it when
 * somebody else's reaction lands on the 8s poll.
 */
export function groupReactions(
    reactions: readonly { emoji: string; memberId: string }[],
    meId?: string
): ReactionGroup[] {
    const groups: ReactionGroup[] = []
    for (const emoji of REACTION_EMOJIS) {
        const mine = reactions.filter((reaction) => reaction.emoji === emoji)
        if (mine.length === 0) continue
        groups.push({
            emoji,
            count: mine.length,
            mine: !!meId && mine.some((reaction) => reaction.memberId === meId),
        })
    }
    return groups
}
