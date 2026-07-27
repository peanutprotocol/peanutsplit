import { type HTMLAttributes } from 'react'
import { cn as twMerge } from '@/lib/cn'

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
    alignItems?: 'start' | 'center'
}

// Mobile-first: 390x844 is the design target. No desktop sidebar offset — Split has no nav rail.
const PageContainer = (props: PageContainerProps) => {
    return (
        <div
            className={twMerge(
                'flex min-h-[inherit] w-full items-start justify-center *:w-full md:*:max-w-xl',
                props.alignItems === 'center' ? 'items-center' : 'items-start',
                props.className
            )}
        >
            {props.children}
        </div>
    )
}

PageContainer.displayName = 'PageContainer'

export { PageContainer }
export default PageContainer
