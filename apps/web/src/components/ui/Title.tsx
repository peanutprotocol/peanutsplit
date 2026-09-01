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
            {/* React hoists this into <head>. Rendered here rather than in a layout so a page
                preloads the hero face exactly when it is about to paint it. Today that is only the
                control-variant hero; the default pass_link LP paints no display-hero type. Only the
                Latin subset is preloaded — the other two are rare enough to fetch on demand. */}
            <link
                rel="preload"
                href="/fonts/gluten-latin-400.woff2"
                as="font"
                type="font/woff2"
                crossOrigin="anonymous"
            />
            <p className={twMerge('relative font-display-hero text-white', offset && 'translate-x-[3px]', className)}>
                {text}
            </p>
            {/* Knerd shipped a drawn outline companion to the filled face. Gluten is a single face,
                so the second layer strokes the same glyphs instead of loading a second file. */}
            <p
                className={twMerge(
                    'absolute left-0 top-0 font-display-hero [-webkit-text-stroke:2px_currentColor] [color:transparent]',
                    className
                )}
                aria-hidden="true"
            >
                {text}
            </p>
        </div>
    )
}

Title.displayName = 'Title'

export { Title }
export default Title
