'use client'

/**
 * Reactions on an expense row. Each pill is one emoji plus the room characters
 * of the people who chose it: identity, rather than a counter, is the useful
 * social signal here.
 *
 * The row owns the visible long-press gesture and controls this picker. A
 * focus-only trigger remains here so keyboard and assistive-technology users
 * have an equivalent path without putting a permanent add control under every
 * expense.
 *
 * This is the room's social layer and deliberately its whole extent: reactions
 * are the allowed subset of "messaging in the room", and there is no thread
 * hanging off them.
 */

import { type KeyboardEvent, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Doodle } from '@/components/ui/Doodle'
import type { DoodleName } from '@/components/ui/doodles'
import { Icon } from '@/components/ui/Icon'
import { roomProps, track } from '@/lib/analytics'
import type { ApiExpense, ApiMember } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { useErrorMessage } from '@/lib/error-messages'
import { useAddReaction, useRemoveReaction } from '@/lib/queries'
import { groupReactions, REACTION_EMOJIS } from '@/lib/reactions'
import { TOAST_MS } from '@/lib/toasts'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'
import { MemberAvatar } from './MemberAvatar'

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
    members: ApiMember[]
    /** The reader, when this device is a member of the roster. */
    meId?: string
    /** The server-issued member token. Reacting is the one expense-level write
     *  that needs it — the API treats it as proof, not attribution. */
    token?: string | null
    /** Prevent writes while the room state is stale or otherwise read-only. */
    disabled?: boolean
    /** Controlled by the expense row's long-press interaction. Omit both picker
     *  props only when rendering ReactionBar outside an interactive row. */
    pickerOpen?: boolean
    onPickerOpenChange?: (open: boolean) => void
}

export function ReactionBar({
    slug,
    expense,
    members,
    meId,
    token,
    disabled = false,
    pickerOpen: controlledPickerOpen,
    onPickerOpenChange,
}: ReactionBarProps) {
    const t = useTranslations('room.reactions')
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const motionAllowed = useMotionAllowed()
    const addReaction = useAddReaction(slug)
    const removeReaction = useRemoveReaction(slug)
    const [uncontrolledPickerOpen, setUncontrolledPickerOpen] = useState(false)
    const pickerOpen = !disabled && (controlledPickerOpen ?? uncontrolledPickerOpen)

    useEffect(() => {
        if (!disabled) return
        setUncontrolledPickerOpen(false)
        if (controlledPickerOpen) onPickerOpenChange?.(false)
    }, [controlledPickerOpen, disabled, onPickerOpenChange])

    const setPickerOpen = (open: boolean) => {
        if (controlledPickerOpen === undefined) setUncontrolledPickerOpen(open)
        onPickerOpenChange?.(open)
    }

    const groups = groupReactions(expense.reactions, meId)
    const memberById = new Map(members.map((member) => [member.id, member]))
    const groupsWithReactors = groups.map((group) => {
        const seen = new Set<string>()
        const reactors = expense.reactions.flatMap((reaction) => {
            if (reaction.emoji !== group.emoji || seen.has(reaction.memberId)) return []
            const member = memberById.get(reaction.memberId)
            if (!member) return []
            seen.add(member.id)
            return [member]
        })
        return { ...group, reactors }
    })
    /** A legacy tokenless identity can read the room's reactions but not sign
     *  one — same rule, and same disabled-with-a-reason shape, as push. */
    const needsToken = !meId || !token
    const canReact = !disabled && !needsToken

    // Nothing to show and nothing to do: a disabled "+" under every row would be
    // a permanent apology on a screen that is mostly other people's dinners.
    if (!canReact && groups.length === 0) return null

    const react = (emoji: string, mine: boolean) => {
        if (!canReact || !meId || !token) return
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

    const handlePickerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setPickerOpen(false)
            return
        }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return

        const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        if (options.length === 0) return
        const current = options.indexOf(document.activeElement as HTMLButtonElement)
        const next =
            event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : (current + (event.key === 'ArrowLeft' ? -1 : 1) + options.length) % options.length
        event.preventDefault()
        options[next]?.focus()
    }

    return (
        <div
            className={cn(
                'relative flex w-full flex-wrap items-center justify-end gap-1.5',
                (groups.length > 0 || pickerOpen) && 'pt-1.5'
            )}
        >
            <AnimatePresence initial={false}>
                {groupsWithReactors.map((group) => {
                    const reactionName = t(`names.${REACTION_ART[group.emoji].label}`)
                    const reactorNames = group.reactors.map((member) => member.name).join(', ')
                    const toggleName = group.mine
                        ? t('remove', { emoji: reactionName })
                        : t('pick', { emoji: reactionName })
                    return (
                        <motion.button
                            key={group.emoji}
                            type="button"
                            layout={motionAllowed}
                            initial={motionAllowed ? { scale: 0.6, opacity: 0 } : false}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={motionAllowed ? { scale: 0.6, opacity: 0 } : undefined}
                            transition={
                                motionAllowed
                                    ? { type: 'spring', stiffness: 420, damping: 22, mass: 0.6 }
                                    : { duration: 0 }
                            }
                            data-motion-surface
                            disabled={!canReact}
                            onClick={() => react(group.emoji, group.mine)}
                            aria-pressed={group.mine}
                            aria-label={`${toggleName}: ${reactorNames}${needsToken ? `. ${t('needsToken')}` : ''}`}
                            data-testid="reaction-pill"
                            data-emoji={group.emoji}
                            data-mine={group.mine}
                            className={cn(
                                'flex min-h-7 items-center gap-1 rounded-full border border-n-1 bg-white py-0.5 pl-1.5 pr-1 text-h9 transition-transform duration-100',
                                // Own reaction reads as pressed-in: the room's tint
                                // plus a shallower shadow, the same language the
                                // selected currency chip already speaks.
                                group.mine ? 'shadow-2 bg-[var(--split-theme-tint,#FFFFFF)]' : 'bg-white',
                                canReact && 'active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                            )}
                        >
                            <Doodle name={REACTION_ART[group.emoji].doodle} size={17} weight={1.8} />
                            <span aria-hidden="true" className="flex -space-x-1">
                                {group.reactors.map((member) => (
                                    <MemberAvatar
                                        key={member.id}
                                        name={member.name}
                                        avatar={member.avatar}
                                        palette={member.avatarPalette}
                                        size={20}
                                    />
                                ))}
                            </span>
                        </motion.button>
                    )
                })}
            </AnimatePresence>

            <button
                type="button"
                disabled={!canReact}
                onClick={() => {
                    feedback('blip')
                    setPickerOpen(!pickerOpen)
                }}
                aria-expanded={pickerOpen}
                aria-label={pickerOpen ? t('close') : t('add')}
                // The reason lives on the control that is refusing, so a
                // token-less reader finds out by touching it rather than by
                // reading a paragraph nobody else needs.
                title={needsToken ? t('needsToken') : disabled ? undefined : t('add')}
                data-testid="reaction-add"
                className={cn(
                    // Not part of normal visual flow: touch users long-press the
                    // expense row. It reveals itself on keyboard focus so this
                    // interaction never becomes touch-only.
                    'sr-only focus:not-sr-only focus:relative focus:flex focus:size-7 focus:items-center focus:justify-center focus:rounded-full focus:border focus:border-dashed focus:border-grey-1 focus:text-grey-1',
                    !canReact && 'opacity-50'
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
                        transition={motionAllowed ? { duration: 0.14, ease: 'easeOut' } : { duration: 0 }}
                        data-motion-surface
                        data-testid="reaction-strip"
                        role="toolbar"
                        aria-label={t('add')}
                        onKeyDown={handlePickerKeyDown}
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
