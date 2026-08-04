import { cn } from '@/lib/cn'

export type ButtonVariant =
    'primary' | 'dark' | 'stroke' | 'transparent-light' | 'transparent-dark' | 'transparent' | 'primary-soft'
export type ButtonSize = 'small' | 'medium' | 'large'
export type ButtonShape = 'default' | 'square'
export type ButtonShadowSize = '3' | '4' | '6' | '8'
export type ButtonShadowType = 'primary' | 'secondary'
export type ButtonWidth = 'full' | 'auto'

const variants: Record<ButtonVariant, string> = {
    primary: 'btn-primary',
    dark: 'btn-dark',
    stroke: 'btn-stroke',
    'transparent-light': 'btn-transparent-light',
    'transparent-dark': 'btn-transparent-dark',
    'primary-soft': 'bg-white',
    transparent:
        'bg-transparent border-none hover:bg-transparent !active:bg-transparent focus:bg-transparent disabled:bg-transparent disabled:hover:bg-transparent',
}

const sizes: Record<ButtonSize, string> = {
    small: 'btn-small',
    medium: 'btn-medium',
    /** @deprecated large (h-10) is shorter than default (h-13). Avoid for primary CTAs. */
    large: 'btn-large',
}

const shadows: Record<ButtonShadowType, Record<ButtonShadowSize, string>> = {
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

interface ButtonStyleOptions {
    variant?: ButtonVariant
    size?: ButtonSize
    shape?: ButtonShape
    shadowSize?: ButtonShadowSize
    shadowType?: ButtonShadowType
    width?: ButtonWidth
    disabled?: boolean
    interactive?: boolean
    className?: string
}

/** Shared styling for real buttons and links that must look like buttons. */
export function buttonClassName({
    variant = 'primary',
    size,
    shape,
    shadowSize,
    shadowType = 'primary',
    width = 'full',
    disabled,
    interactive = true,
    className,
}: ButtonStyleOptions = {}) {
    return cn(
        'btn flex items-center gap-2 transition-all duration-100',
        interactive && 'active:translate-x-[3px] active:shadow-none',
        width === 'full' ? 'w-full' : 'w-auto',
        variants[variant],
        variant === 'transparent' && disabled && 'disabled:bg-transparent disabled:border-transparent',
        size && sizes[size],
        shape === 'square' && 'btn-square',
        shadowSize && shadows[shadowType][shadowSize],
        className
    )
}
