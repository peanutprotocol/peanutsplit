'use client'
import React, { forwardRef, useCallback } from 'react'
import { cn as twMerge } from '@/lib/cn'
import { Icon, type IconName } from './Icon'
import Loading from './Loading'
import { triggerHaptic, useSettings } from '@/lib/use-settings'
import { useLongPress } from '@/hooks/useLongPress'
import {
    buttonClassName,
    type ButtonShape,
    type ButtonShadowSize,
    type ButtonShadowType,
    type ButtonSize,
    type ButtonVariant,
    type ButtonWidth,
} from './button-style'

export type { ButtonSize, ButtonVariant } from './button-style'

// Ported from peanut-ui's Bruddle Button, renamed for Split's palette:
// variant="primary" shadowSize="4" is the primary CTA and paints YELLOW (#FFC900).
/** A tap is the lightest cue there is — the same duration use-settings gives 'tick'. */
const TAP_HAPTIC_MS = 5

/**
 * Primary button component.
 *
 * @prop variant - Visual style. 'primary' for primary CTAs, 'stroke' for secondary.
 * @prop size - Height override. Omit for default h-13 (tallest). 'large' is h-10 (shorter!).
 * @prop shadowSize - Drop shadow depth. '4' is standard.
 * @prop longPress - Hold-to-confirm behavior with progress bar animation.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    size?: ButtonSize
    shape?: ButtonShape
    shadowSize?: ButtonShadowSize
    shadowType?: ButtonShadowType
    width?: ButtonWidth
    loading?: boolean
    icon?: IconName | React.ReactNode
    iconPosition?: 'left' | 'right'
    iconClassName?: string
    iconSize?: number
    iconContainerClassName?: HTMLDivElement['className']
    longPress?: {
        duration?: number // Duration in milliseconds (default: 2000)
        onLongPress?: () => void
        onLongPressStart?: () => void
        onLongPressEnd?: () => void
    }
    disableHaptics?: boolean
}

const buttonIconSizes: Record<ButtonSize, number> = {
    small: 16,
    medium: 16,
    large: 18,
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            children,
            className,
            loading,
            variant = 'primary',
            size,
            shape,
            shadowSize,
            shadowType,
            width,
            icon,
            iconPosition = 'left',
            iconSize,
            iconClassName,
            iconContainerClassName,
            longPress,
            onClick,
            disabled,
            disableHaptics,
            ...props
        },
        ref
    ) => {
        // Every other cue in the app goes through use-settings, which owns the
        // one hidden iOS switch and the user's haptics preference. Calling the
        // `use-haptic` hook here instead ignored that toggle — a user who turned
        // haptics off still felt every button.
        const { settings } = useSettings()
        const { isLongPressed, pressProgress, handlers: longPressHandlers } = useLongPress(longPress)

        const handleClick = useCallback(
            (e: React.MouseEvent<HTMLButtonElement>) => {
                if (longPress && !isLongPressed) {
                    return
                }

                if (!disableHaptics && settings.hapticsEnabled) {
                    triggerHaptic(TAP_HAPTIC_MS)
                }

                onClick?.(e)
            },
            [longPress, isLongPressed, onClick, disableHaptics, settings.hapticsEnabled]
        )

        const buttonClasses = buttonClassName({
            variant,
            size,
            shape,
            shadowSize,
            shadowType,
            width,
            disabled,
            className,
        })

        const resolvedIconSize = iconSize ?? (size && buttonIconSizes[size]) ?? 18

        const renderIcon = () => {
            if (!icon || loading) return null
            return (
                <div className={twMerge('flex size-6 items-center justify-center', iconContainerClassName)}>
                    {typeof icon === 'string' ? (
                        <Icon size={resolvedIconSize} name={icon as IconName} className={iconClassName} />
                    ) : (
                        icon
                    )}
                </div>
            )
        }

        return (
            <button
                className={twMerge(buttonClasses, longPress && 'relative overflow-hidden')}
                ref={ref}
                onClick={handleClick}
                onMouseDown={longPress ? longPressHandlers.onMouseDown : undefined}
                onMouseUp={longPress ? longPressHandlers.onMouseUp : undefined}
                onMouseLeave={longPress ? longPressHandlers.onMouseLeave : undefined}
                onTouchStart={longPress ? longPressHandlers.onTouchStart : undefined}
                onTouchEnd={longPress ? longPressHandlers.onTouchEnd : undefined}
                onTouchCancel={longPress ? longPressHandlers.onTouchCancel : undefined}
                {...props}
                disabled={disabled || loading}
                aria-busy={loading || undefined}
            >
                {/* Progress bar for long press */}
                {longPress && pressProgress > 0 && (
                    <div
                        className="absolute inset-0 bg-n-1 opacity-20 transition-all duration-75 ease-out"
                        style={{ width: `${pressProgress}%` }}
                    />
                )}

                {loading && <Loading />}
                {iconPosition === 'left' && renderIcon()}
                {children}
                {iconPosition === 'right' && renderIcon()}
            </button>
        )
    }
)

Button.displayName = 'Button'
