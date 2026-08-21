import { cn as twMerge } from '@/lib/cn'

const Title = ({
    text,
    className,
    offset = true,
}: {
    text: string
    offset?: boolean
} & React.HTMLAttributes<HTMLParagraphElement>) => {
    return (
        <div className="relative inline-block">
            {/* React hoists these into <head>. Rendered here rather than in a layout so a page
                preloads the two knerd faces exactly when it is about to paint them. Today that
                is only the control-variant hero; the default pass_link LP paints no knerd. */}
            <link rel="preload" href="/fonts/knerd-filled.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
            <link rel="preload" href="/fonts/knerd-outline.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
            <p className={twMerge('relative font-knerd-filled text-white', offset && 'translate-x-[3px]', className)}>
                {text}
            </p>
            <p className={twMerge('absolute left-0 top-0 font-knerd-outline', className)}>{text}</p>
        </div>
    )
}

Title.displayName = 'Title'

export { Title }
export default Title
