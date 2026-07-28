'use client'

/**
 * Reactions on an expense row: the pills that are already there, plus a way to
 * add one.
 *
 * A "+" affordance rather than a long-press, even though the hook exists. The
 * row itself is a button that opens the expense drawer, and a long-press on a
 * button still fires its click on release — the two gestures would fight, and
 * the loser would be someone trying to react who gets an edit sheet instead. A
 * small explicit target is also the only version that works with a keyboard.
 *
 * This is the room's social layer and deliberately its whole extent: reactions
 * are the allowed subset of "messaging in the room", and there is no thread
 * hanging off them.
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Doodle } from '@/components/ui/Doodle'
import type { DoodleName } from '@/components/ui/doodles'
import { Icon } from '@/components/ui/Icon'
import { roomProps, track } from '@/lib/analytics'
import type { ApiExpense } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { useErrorMessage } from '@/lib/error-messages'
import { useAddReaction, useRemoveReaction } from '@/lib/queries'
import { groupReactions, REACTION_EMOJIS } from '@/lib/reactions'
import { TOAST_MS } from '@/lib/toasts'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'

const REACTION_ART = {
    '🔥': { doodle: 'reactionfire', label: 'wild' },
    '😂': { doodle: 'reactionlaugh', label: 'laugh' },
    '😭': { doodle: 'reactiontear', label: 'ouch' },
    '🫶': { doodle: 'reactionlove', label: 'love' },
    '👏': { doodle: 'reactionclap', label: 'clap' },
    '🤑': { doodle: 'cash', label: 'money' },
} as const satisfies Record<string, { doodle: DoodleName; label: string }>

interface ReactionBarProps {
    slug: string
    expense: ApiExpense
    /** The reader, when this device is a member of the roster. */
    meId?: string
    /** The server-issued member token. Reacting is the one expense-level write
     *  that needs it — the API treats it as proof, not attribution. */
    token?: string | null
}

export function ReactionBar({ slug, expense, meId, token }: ReactionBarProps) {
    const t = useTranslations('room.reactions')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()
    const addReaction = useAddReaction(slug)
    const removeReaction = useRemoveReaction(slug)
    const [pickerOpen, setPickerOpen] = useState(false)

    const groups = groupReactions(expense.reactions, meId)
    /** A legacy tokenless identity can read the room's reactions but not sign
     *  one — same rule, and same disabled-with-a-reason shape, as push. */
    const canReact = !!meId && !!token

    // Nothing to show and nothing to do: a disabled "+" under every row would be
    // a permanent apology on a screen that is mostly other people's dinners.
    if (!canReact && groups.length === 0) return null

    const react = (emoji: string, mine: boolean) => {
        if (!meId || !token) return
        setPickerOpen(false)
        const variables = { expenseId: expense.id, emoji, memberId: meId, memberToken: token }
        const failed = (error: unknown) => {
            feedback('error')
            toast.error(errorMessage(error, t('failed')), { duration: TOAST_MS.actionable })
        }
        if (mine) {
            feedback('tick')
            track('reaction_removed', roomProps(slug))
            removeReaction.mutate(variables, { onError: failed })
        } else {
            // The cork: a reaction is a small, deliberate, cheerful thing, and
            // `pop` is the cue this palette already uses for exactly that.
            feedback('pop')
            track('reaction_added', roomProps(slug))
            addReaction.mutate(variables, { onError: failed })
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5 pl-1 pt-1.5">
            <AnimatePresence initial={false}>
                {groups.map((group) => (
                    <motion.button
                        key={group.emoji}
                        type="button"
                        layout={motionAllowed}
                        initial={motionAllowed ? { scale: 0.6, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={motionAllowed ? { scale: 0.6, opacity: 0 } : undefined}
                        transition={{ type: 'spring', stiffness: 420, damping: 22, mass: 0.6 }}
                        disabled={!canReact}
                        onClick={() => react(group.emoji, group.mine)}
                        aria-pressed={group.mine}
                        aria-label={t('reacted', {
                            emoji: t(`names.${REACTION_ART[group.emoji].label}`),
                            count: group.count,
                        })}
                        data-testid="reaction-pill"
                        data-emoji={group.emoji}
                        data-mine={group.mine}
                        className={cn(
                            'flex min-h-7 items-center gap-1 rounded-sm border border-n-1 px-2 py-0.5 text-h9 transition-transform duration-100',
                            // Own reaction reads as pressed-in: the room's tint
                            // plus a shallower shadow, the same language the
                            // selected currency chip already speaks.
                            group.mine ? 'shadow-2 bg-[var(--split-theme-tint,#FFFFFF)]' : 'bg-white',
                            canReact && 'active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                        )}
                    >
                        <Doodle name={REACTION_ART[group.emoji].doodle} size={17} weight={1.8} />
                        <span aria-hidden="true" className="tabular-nums">
                            {group.count}
                        </span>
                    </motion.button>
                ))}
            </AnimatePresence>

            <button
                type="button"
                disabled={!canReact}
                onClick={() => {
                    feedback('blip')
                    setPickerOpen((open) => !open)
                }}
                aria-expanded={pickerOpen}
                aria-label={pickerOpen ? t('close') : t('add')}
                // The reason lives on the control that is refusing, so a
                // token-less reader finds out by touching it rather than by
                // reading a paragraph nobody else needs.
                title={canReact ? t('add') : t('needsToken')}
                data-testid="reaction-add"
                className={cn(
                    'flex size-7 items-center justify-center rounded-sm border border-dashed border-grey-1 text-h9 text-grey-1 transition-transform duration-100',
                    canReact ? 'active:translate-y-[1px]' : 'opacity-50'
                )}
            >
                {/* A faded drawn face rather than a "+". The dashed square already
                    says "something goes here"; what it did not say is WHAT, and a
                    plus beside a money row reads as "add an expense" — the one
                    thing on this screen it must not be confused with. */}
                {pickerOpen ? (
                    <Icon name="x" size={15} />
                ) : (
                    <Doodle name="reactionlaugh" size={17} weight={1.6} className="opacity-45" />
                )}
            </button>

            <AnimatePresence initial={false}>
                {pickerOpen && canReact && (
                    <motion.div
                        initial={motionAllowed ? { opacity: 0, y: -4 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        exit={motionAllowed ? { opacity: 0, y: -4 } : undefined}
                        transition={{ duration: 0.14, ease: 'easeOut' }}
                        data-testid="reaction-strip"
                        className="shadow-2 flex items-center gap-1 rounded-sm border border-n-1 bg-white px-1.5 py-1"
                    >
                        {REACTION_EMOJIS.map((emoji) => {
                            const mine = groups.some((group) => group.emoji === emoji && group.mine)
                            const label = t(`names.${REACTION_ART[emoji].label}`)
                            return (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => react(emoji, mine)}
                                    aria-label={mine ? t('remove', { emoji: label }) : t('pick', { emoji: label })}
                                    data-testid="reaction-option"
                                    data-emoji={emoji}
                                    className={cn(
                                        'flex size-8 items-center justify-center rounded-sm text-h7 transition-transform duration-100 active:scale-90',
                                        mine && 'bg-[var(--split-theme-tint,#FFFFFF)]'
                                    )}
                                >
                                    <Doodle name={REACTION_ART[emoji].doodle} size={22} weight={1.7} />
                                </button>
                            )
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
