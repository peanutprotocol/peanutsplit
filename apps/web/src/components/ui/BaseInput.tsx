import { forwardRef } from 'react'
import { cn as twMerge } from '@/lib/cn'
import { fieldSizes, type FieldSize } from './field'

interface BaseInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    variant?: FieldSize
    rightContent?: React.ReactNode
}

const BaseInput = forwardRef<HTMLInputElement, BaseInputProps>(
    ({ className, variant = 'md', rightContent, ...props }, ref) => {
        const c = twMerge('input', fieldSizes[variant], className)

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
