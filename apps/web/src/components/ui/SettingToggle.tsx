'use client'

import { motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { useMotionAllowed } from '@/lib/use-motion'
import { Icon } from './Icon'

/**
 * A hard-edged switch rather than an iOS toggle — the whole design system is
 * 1px borders and black shadows, and a rounded pill would be the only soft thing
 * on the screen. On = filled yellow with a check, exactly like the participant
 * checkboxes in the expense drawer.
 *
 * `hint` is optional and the line is not reserved when it is absent. Every
 * device preference demonstrates itself on flip — sound plays the tick, haptics
 * pulses, animations springs — so a sentence under the label is a caption on a
 * thing that already said it.
 */
export function SettingToggle({
    label,
    hint,
    checked,
    onChange,
    disabled,
    loading,
    testId,
}: {
    label: string
    hint?: string
    checked: boolean
    onChange: (next: boolean) => void
    disabled?: boolean
    loading?: boolean
    /**
     * Passed in rather than derived from `label`. The test id used to be
     * `setting-${label.toLowerCase()}`, which meant translating "Sound" renamed the hook the e2e
     * suite selects on — a locale change would have silently broken the tests.
     */
    testId: string
}) {
    const motionAllowed = useMotionAllowed()

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-busy={loading || undefined}
            disabled={disabled || loading}
            onClick={() => onChange(!checked)}
            data-testid={testId}
            className={cn(
                'flex min-h-11 w-full items-center gap-3 rounded-sm border border-n-1 bg-white p-3 text-left transition-transform duration-100 active:translate-y-[2px]',
                (disabled || loading) && 'cursor-default active:translate-y-0'
            )}
        >
            <span className="min-w-0 flex-1">
                <span className="block text-h8">{label}</span>
                {hint && <span className="block text-sm text-grey-1">{hint}</span>}
            </span>
            <motion.span
                animate={{ backgroundColor: checked ? '#FFC900' : '#FFFFFF' }}
                transition={motionAllowed ? { duration: 0.15 } : { duration: 0 }}
                data-motion-surface
                className="flex size-6 shrink-0 items-center justify-center rounded-sm border border-n-1"
            >
                {loading ? (
                    <span className="size-2 animate-pulse rounded-full bg-n-1 motion-reduce:animate-none" />
                ) : (
                    checked && <Icon name="check" size={16} />
                )}
            </motion.span>
        </button>
    )
}
