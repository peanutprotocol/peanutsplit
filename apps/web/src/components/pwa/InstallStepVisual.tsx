import type { ReactNode } from 'react'

/** Browser controls retain their familiar shapes, as in Peanut UI's install guide. */
export function InstallStepVisual({
    icons = [],
    label,
    children,
}: {
    icons?: Array<'share' | 'more' | 'more-vertical' | 'add-home' | 'install'>
    label?: string
    children?: ReactNode
}) {
    return (
        <span
            aria-hidden="true"
            data-testid="install-step-visual"
            className="mt-2 inline-flex min-h-10 items-center justify-center gap-3 rounded-lg border border-grey-2 bg-grey-4 px-3 py-2 text-sm font-medium leading-5"
        >
            {icons.map((icon) => (
                <img key={icon} src={`/install/${icon}.svg`} alt="" width={24} height={24} />
            ))}
            {label}
            {children}
        </span>
    )
}
