import { forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'

type BaseInputVariant = 'sm' | 'md' | 'lg'

interface BaseInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    variant?: BaseInputVariant
    rightContent?: React.ReactNode
}

const BaseInput = forwardRef<HTMLInputElement, BaseInputProps>(
    ({ className, variant = 'md', rightContent, ...props }, ref) => {
        const variants: Record<BaseInputVariant, string> = {
            sm: 'h-10 px-3',
            md: 'h-16 px-5',
            lg: 'h-20 px-6',
        }

        const c = twMerge('input', variants[variant], className)

        return (
            <div className="relative w-full">
                <input ref={ref} className={twMerge(c, !!rightContent && 'pr-15 md:pr-18')} {...props} />
                {rightContent && (
                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">{rightContent}</div>
                )}
            </div>
        )
    }
)

BaseInput.displayName = 'BaseInput'

export { BaseInput }
export default BaseInput
