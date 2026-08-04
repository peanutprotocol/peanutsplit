import { cn } from '@/lib/cn'

/** Stable receipt-composer recipes shared by room creation, expenses and tools. */
export const composerSurfaceClassName = (className?: string) =>
    cn('shadow-4 overflow-hidden rounded-lg border-2 border-n-1 bg-white', className)

export const composerRowClassName = (className?: string) => cn('border-t border-dashed border-grey-1', className)

export const composerBareInputClassName = (className?: string) =>
    cn('w-full min-w-0 border-0 bg-transparent outline-none placeholder:text-grey-2', className)

export const composerBoxedInputClassName = (className?: string) =>
    cn('h-11 rounded-sm border border-n-1 bg-white px-3 text-right text-sm font-bold text-n-1 outline-none', className)

export const COMPOSER_CURRENCY_SLOT = 'w-[7.25rem] shrink-0'
