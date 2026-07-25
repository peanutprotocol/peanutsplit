'use client'
import React, { forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'
import Loading from './Loading'

// Trimmed from peanut-ui 0_Bruddle/Button: same class contract and visual
// result, minus the icon/haptics/long-press machinery Split never uses.

export type ButtonVariant = 'purple' | 'dark' | 'stroke' | 'transparent'
export type ButtonSize = 'small' | 'medium' | 'large'
type ShadowSize = '3' | '4' | '6' | '8'
type ShadowType = 'primary' | 'secondary'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant
	size?: ButtonSize
	shadowSize?: ShadowSize
	shadowType?: ShadowType
	loading?: boolean
}

const buttonVariants: Record<ButtonVariant, string> = {
	purple: 'btn-purple',
	dark: 'btn-dark',
	stroke: 'btn-stroke',
	transparent: 'btn-transparent',
}

const buttonSizes: Record<ButtonSize, string> = {
	small: 'btn-small',
	medium: 'btn-medium',
	large: 'btn-large',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			variant = 'purple',
			size,
			shadowSize,
			shadowType = 'primary',
			loading = false,
			disabled,
			className,
			children,
			onClick,
			...props
		},
		ref
	) => (
		<button
			ref={ref}
			// A loading button must not fire again — the settlement double-record
			// bug came from exactly this gap in the original.
			disabled={disabled || loading}
			onClick={loading ? undefined : onClick}
			className={twMerge(
				buttonVariants[variant],
				size && buttonSizes[size],
				shadowSize && `btn-shadow-${shadowType}-${shadowSize}`,
				'gap-2',
				className
			)}
			{...props}
		>
			{loading && <Loading />}
			{children}
		</button>
	)
)

Button.displayName = 'Button'
