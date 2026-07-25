'use client'
import React, { forwardRef, useCallback, useEffect, useRef } from 'react'
import { twMerge } from 'tailwind-merge'
import { Icon, type IconName } from './Icon'
import Loading from './Loading'
import { useHaptic } from 'use-haptic'
import { useLongPress } from '@/hooks/useLongPress'

// Variant names are carried over verbatim from peanut-ui so the shared idiom
// (`variant="purple" shadowSize="4"` = primary CTA) still reads the same. In Split
// the underlying `.btn-purple` class paints YELLOW (#FFC900) — the palette diverged,
// the names did not.
export type ButtonVariant =
    'purple' | 'dark' | 'stroke' | 'transparent-light' | 'transparent-dark' | 'transparent' | 'primary-soft'
export type ButtonSize = 'small' | 'medium' | 'large'
type ButtonShape = 'default' | 'square'
type ShadowSize = '3' | '4' | '6' | '8'
type ShadowType = 'primary' | 'secondary'

/**
 * Primary button component.
 *
 * @prop variant - Visual style. 'purple' for primary CTAs, 'stroke' for secondary.
 * @prop size - Height override. Omit for default h-13 (tallest). 'large' is h-10 (shorter!).
 * @prop shadowSize - Drop shadow depth. '4' is standard.
 * @prop longPress - Hold-to-confirm behavior with progress bar animation.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    size?: ButtonSize
    shape?: ButtonShape
    shadowSize?: ShadowSize
    shadowType?: ShadowType
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

const buttonVariants: Record<ButtonVariant, string> = {
    purple: 'btn-purple',
    dark: 'btn-dark',
    stroke: 'btn-stroke',
    'transparent-light': 'btn-transparent-light',
    'transparent-dark': 'btn-transparent-dark',
    'primary-soft': 'bg-white',
    transparent:
        'bg-transparent border-none hover:bg-transparent !active:bg-transparent focus:bg-transparent disabled:bg-transparent disabled:hover:bg-transparent',
}

const buttonSizes: Record<ButtonSize, string> = {
    small: 'btn-small',
    medium: 'btn-medium',
    /** @deprecated large (h-10) is shorter than default (h-13). Avoid for primary CTAs. */
    large: 'btn-large',
}

const buttonIconSizes: Record<ButtonSize, number> = {
    small: 16,
    medium: 16,
    large: 18,
}

const buttonShadows: Record<ShadowType, Record<ShadowSize, string>> = {
    primary: {
        '3': 'btn-shadow-primary-3',
        '4': 'btn-shadow-primary-4',
        '6': 'btn-shadow-primary-6',
        '8': 'btn-shadow-primary-8',
    },
    secondary: {
        '3': 'btn-shadow-secondary-3',
        '4': 'btn-shadow-secondary-4',
        '6': 'btn-shadow-secondary-6',
        '8': 'btn-shadow-secondary-8',
    },
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            children,
            className,
            loading,
            variant = 'purple',
            size,
            shape,
            shadowSize,
            shadowType,
            icon,
            iconPosition = 'left',
            iconSize,
            iconClassName,
            iconContainerClassName,
            longPress,
            onClick,
            disableHaptics,
            ...props
        },
        ref
    ) => {
        const localRef = useRef<HTMLButtonElement>(null)
        const buttonRef = (ref as React.RefObject<HTMLButtonElement>) || localRef

        const { triggerHaptic } = useHaptic()
        const { isLongPressed, pressProgress, handlers: longPressHandlers } = useLongPress(longPress)

        useEffect(() => {
            if (!buttonRef.current) return
            buttonRef.current.setAttribute('translate', 'no')
            buttonRef.current.classList.add('notranslate')
        }, [buttonRef])

        const handleClick = useCallback(
            (e: React.MouseEvent<HTMLButtonElement>) => {
                if (longPress && !isLongPressed) {
                    return
                }

                if (!disableHaptics) {
                    triggerHaptic()
                }

                onClick?.(e)
            },
            [longPress, isLongPressed, onClick, disableHaptics, triggerHaptic]
        )

        const buttonClasses = twMerge(
            'btn flex w-full items-center gap-2 transition-all duration-100 active:translate-x-[3px] active:shadow-none notranslate',
            buttonVariants[variant],
            variant === 'transparent' && props.disabled && 'disabled:bg-transparent disabled:border-transparent',
            size && buttonSizes[size],
            shape === 'square' && 'btn-square',
            shadowSize && buttonShadows[shadowType || 'primary'][shadowSize],
            className
        )

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
                className={twMerge(buttonClasses, 'notranslate', longPress && 'relative overflow-hidden')}
                ref={buttonRef}
                translate="no"
                onClick={handleClick}
                onMouseDown={longPress ? longPressHandlers.onMouseDown : undefined}
                onMouseUp={longPress ? longPressHandlers.onMouseUp : undefined}
                onMouseLeave={longPress ? longPressHandlers.onMouseLeave : undefined}
                onTouchStart={longPress ? longPressHandlers.onTouchStart : undefined}
                onTouchEnd={longPress ? longPressHandlers.onTouchEnd : undefined}
                onTouchCancel={longPress ? longPressHandlers.onTouchCancel : undefined}
                {...props}
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
